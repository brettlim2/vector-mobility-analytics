"""Device-level socioeconomic index.

Composes four signals into ses_score + islandwide quintiles:

  1. Dwelling type + home_value_proxy  (weight 0.45)
  2. Device OS (idfa = iOS)            (weight 0.10)
  3. Car vs transit reliance           (weight 0.25)
  4. Venue price-tier affinity         (weight 0.20)

Device rows stay in the warehouse (`device_ses`). Exports are k-anonymous
aggregates only (see insights.run_ses / urban_context.ses_validation).
"""

from __future__ import annotations

import duckdb


# Locked v1 weights from the product plan
W_VALUE = 0.45
W_IOS = 0.10
W_CAR = 0.25
W_TIER = 0.20


def build_ses(con: duckdb.DuckDBPyConnection) -> None:
    """Build `device_ses` for trajectory devices with a home_pa."""
    # Ensure brand_tiers exists even if pois step wasn't re-run
    from . import ROOT
    brand_csv = ROOT / "data/brand_tiers.csv"
    if not brand_csv.exists():
        brand_csv = ROOT.parent / "VectorMobility MVP" / "data/brand_tiers.csv"
    has_bt = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = 'brand_tiers'"
    ).fetchone()[0] > 0
    if not has_bt and brand_csv.exists():
        con.execute(f"""
            CREATE OR REPLACE TABLE brand_tiers AS
            SELECT lower(trim(brand_or_name)) AS brand_key, tier::INT AS tier
            FROM read_csv('{brand_csv}', header=true)""")
    elif not has_bt:
        con.execute("""
            CREATE OR REPLACE TABLE brand_tiers AS
            SELECT * FROM (VALUES ('', 0)) t(brand_key, tier) WHERE false""")

    # Car vs transit: fast trip share (speaks to car in COE-land) minus MRT contact
    con.execute("""
        CREATE OR REPLACE TEMP TABLE ses_car AS
        SELECT f.device_id,
               coalesce(
                 count(*) FILTER (t.dist_km / nullif(t.travel_min / 60.0, 0) >= 25)
                   / nullif(count(*), 0)::DOUBLE, 0) AS fast_trip_share,
               coalesce(f.mrt_stops, 0)::DOUBLE AS mrt_stops,
               coalesce(
                 count(*) FILTER (t.dist_km / nullif(t.travel_min / 60.0, 0) >= 25)
                   / nullif(count(*), 0)::DOUBLE, 0)
                 - least(coalesce(f.mrt_stops, 0), 20) / 20.0 AS car_signal
        FROM device_features f
        LEFT JOIN trips t ON t.device_id = f.device_id
          AND t.travel_min BETWEEN 2 AND 120 AND t.dist_km >= 0.4
        GROUP BY f.device_id, f.mrt_stops""")

    # Venue price-tier: brand column may be absent on older visits tables
    visit_cols = {r[0] for r in con.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'visits'"
    ).fetchall()}
    brand_expr = "v.poi_brand" if "poi_brand" in visit_cols else "NULL"
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE ses_tier AS
        SELECT v.device_id,
               avg(coalesce(bt.tier, bt2.tier)) AS mean_tier,
               count(*) FILTER (bt.tier IS NOT NULL OR bt2.tier IS NOT NULL) AS tiered_visits
        FROM visits v
        LEFT JOIN brand_tiers bt
          ON lower(trim(coalesce({brand_expr}, ''))) = bt.brand_key
        LEFT JOIN brand_tiers bt2
          ON bt.brand_key IS NULL
         AND lower(v.poi_name) = bt2.brand_key
        GROUP BY 1""")

    # Dwelling value: join home_dwelling by rounded cell
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE ses_raw AS
        SELECT
          f.device_id, f.home_pa, f.id_type,
          coalesce(hd.dwelling, 'unknown') AS dwelling,
          coalesce(hd.home_value_proxy, 400000)::DOUBLE AS home_value,
          CASE WHEN f.id_type = 'idfa' THEN 1.0 ELSE 0.0 END AS is_ios,
          coalesce(c.car_signal, 0) AS car_signal,
          coalesce(t.mean_tier, 3.0) AS mean_tier,
          coalesce(t.tiered_visits, 0) AS tiered_visits
        FROM device_features f
        LEFT JOIN home_dwelling hd
          ON round(f.hlat, 4) = hd.hlat AND round(f.hlng, 4) = hd.hlng
        LEFT JOIN ses_car c USING (device_id)
        LEFT JOIN ses_tier t USING (device_id)
        WHERE f.home_pa IS NOT NULL""")

    # Z-score each signal among home-anchored devices; missing → 0 after z
    con.execute(f"""
        CREATE OR REPLACE TABLE device_ses AS
        WITH stats AS (
          SELECT
            avg(ln(home_value)) AS mu_v, stddev_pop(ln(home_value)) AS sd_v,
            avg(is_ios) AS mu_i, stddev_pop(is_ios) AS sd_i,
            avg(car_signal) AS mu_c, stddev_pop(car_signal) AS sd_c,
            avg(mean_tier) AS mu_t, stddev_pop(mean_tier) AS sd_t
          FROM ses_raw
        ),
        scored AS (
          SELECT r.*,
            coalesce((ln(r.home_value) - s.mu_v) / nullif(s.sd_v, 0), 0) AS z_value,
            coalesce((r.is_ios - s.mu_i) / nullif(s.sd_i, 0), 0) AS z_ios,
            coalesce((r.car_signal - s.mu_c) / nullif(s.sd_c, 0), 0) AS z_car,
            coalesce((r.mean_tier - s.mu_t) / nullif(s.sd_t, 0), 0) AS z_tier
          FROM ses_raw r CROSS JOIN stats s
        ),
        weighted AS (
          SELECT *,
            {W_VALUE} * z_value + {W_IOS} * z_ios
              + {W_CAR} * z_car + {W_TIER} * z_tier AS ses_score
          FROM scored
        )
        SELECT device_id, home_pa, dwelling, home_value, is_ios, car_signal,
               mean_tier, tiered_visits,
               z_value, z_ios, z_car, z_tier, ses_score,
               ntile(5) OVER (ORDER BY ses_score) AS ses_quintile
        FROM weighted""")
    n = con.execute("SELECT count(*), round(avg(ses_score), 3) FROM device_ses").fetchone()
    q = con.execute("""
        SELECT ses_quintile, count(*) FROM device_ses
        GROUP BY 1 ORDER BY 1""").fetchall()
    print(f"[build] device_ses: {n[0]:,} devices, mean_score={n[1]}; quintiles={q}",
          flush=True)
