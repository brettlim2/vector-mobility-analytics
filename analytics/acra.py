"""ACRA business registry → industry labels for work anchors.

Downloads (optional) the ACRA entities CSV, collapses to postal-code entity-type
mix, geocodes postal sectors to approximate centroids, and joins work anchors
within ~250 m of a sector centroid.

Privacy: only `acra_work_industry` (device_id → industry_label) stays in the
warehouse; exports are industry-mix aggregates by PA / occupation, never
firm↔device pairs.
"""

from __future__ import annotations

import duckdb

from . import ROOT

_LOCAL_DG = ROOT / "data/datagov"
_MVP_DG = ROOT.parent / "VectorMobility MVP" / "data/datagov"
DG = _LOCAL_DG if _LOCAL_DG.exists() else _MVP_DG


def build_acra(con: duckdb.DuckDBPyConnection) -> None:
    mix = DG / "acra_postal_entity_mix.csv"
    sectors = DG / "postal_sector_centroids.csv"
    if not mix.exists():
        # Try to materialise from full entities CSV if present
        from .fetch_datagov import aggregate_acra_by_postal
        mix_path = aggregate_acra_by_postal()
        if mix_path is None or not mix_path.exists():
            print("[build] acra skipped (no acra_postal_entity_mix.csv; "
                  "run: python3 -m analytics.fetch_datagov --acra)", flush=True)
            con.execute("""
                CREATE OR REPLACE TABLE acra_work_industry AS
                SELECT CAST(NULL AS BIGINT) AS device_id,
                       CAST(NULL AS VARCHAR) AS industry_label,
                       CAST(NULL AS VARCHAR) AS postal_code
                WHERE false""")
            return

    if not sectors.exists():
        print("[build] acra skipped (postal_sector_centroids.csv missing)", flush=True)
        return

    con.execute(f"""
        CREATE OR REPLACE TABLE acra_postal AS
        SELECT postal_code, sector, n_entities, top_entity_type, top_n
        FROM read_csv('{mix}', header=true)""")
    con.execute(f"""
        CREATE OR REPLACE TABLE postal_sectors AS
        SELECT sector, lat::DOUBLE AS lat, lng::DOUBLE AS lng
        FROM read_csv('{sectors}', header=true)""")

    # Modal industry (entity type) per postal sector
    con.execute("""
        CREATE OR REPLACE TEMP TABLE sector_industry AS
        SELECT a.sector,
               mode(a.top_entity_type) AS industry_label,
               sum(a.n_entities) AS n_entities,
               any_value(s.lat) AS lat, any_value(s.lng) AS lng
        FROM acra_postal a
        JOIN postal_sectors s USING (sector)
        GROUP BY a.sector""")

    # Work anchors (weekday daytime medians) → nearest sector within ~250 m
    con.execute("""
        CREATE OR REPLACE TEMP TABLE work_pts AS
        SELECT f.device_id, median(s.lat) AS wlat, median(s.lng) AS wlng
        FROM device_features f
        JOIN stops s ON s.device_id = f.device_id
          AND s.start_hour BETWEEN 9 AND 17 AND s.dow BETWEEN 1 AND 5
          AND s.dwell_min >= 60
        WHERE f.work_pa IS NOT NULL
        GROUP BY f.device_id""")

    con.execute("""
        CREATE OR REPLACE TABLE acra_work_industry AS
        WITH cand AS (
          SELECT w.device_id, i.industry_label, i.sector AS postal_sector,
                 hav_m(w.wlat, w.wlng, i.lat, i.lng) AS dist_m
          FROM work_pts w
          JOIN sector_industry i
            ON abs(w.wlat - i.lat) < 0.01 AND abs(w.wlng - i.lng) < 0.01
          WHERE hav_m(w.wlat, w.wlng, i.lat, i.lng) <= 250
        )
        SELECT device_id,
               arg_min(industry_label, dist_m) AS industry_label,
               arg_min(postal_sector, dist_m) AS postal_code
        FROM cand
        GROUP BY device_id""")
    n = con.execute("SELECT count(*) FROM acra_work_industry").fetchone()[0]
    top = con.execute("""
        SELECT industry_label, count(*) AS n FROM acra_work_industry
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8""").fetchall()
    print(f"[build] acra_work_industry: {n:,} devices; top={top}", flush=True)
