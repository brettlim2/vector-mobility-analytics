"""Statistical weighting: post-stratification + feed-hour correction.

1. device_weights — each home-anchored device carries
   weight = PA residents / PA home-anchored devices, so weighted sums estimate
   population counts instead of panel counts. Devices without a home anchor get
   weight NULL (excluded from weighted estimates). Weights are trimmed at the
   99th percentile to stop tiny-panel PAs dominating.

2. feed_hour_weights — the agg feed resets at the UTC day boundary (2.8x step
   at 08:00 SGT). Per hour-of-day weights rescale agg device counts so the agg
   hourly *shape* matches the sdk/app feed's shape; hourly analyses can then use
   the full feed. Calibrated separately for weekday and weekend.
"""

from __future__ import annotations

import duckdb


def build_device_weights(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE OR REPLACE TABLE device_weights AS
        WITH pa_panel AS (
          SELECT home_pa AS pa, count(*) AS home_devices
          FROM device_features WHERE home_pa IS NOT NULL GROUP BY 1
        ),
        raw AS (
          SELECT f.device_id, f.home_pa,
                 pop.residents / pp.home_devices::DOUBLE AS w_raw
          FROM device_features f
          JOIN pa_panel pp ON pp.pa = f.home_pa
          JOIN pa_population pop ON pop.pa = f.home_pa
        ),
        trim AS (SELECT quantile_cont(w_raw, 0.99) AS cap FROM raw)
        SELECT device_id, home_pa,
               least(w_raw, (SELECT cap FROM trim)) AS weight
        FROM raw""")
    n = con.execute("""
        SELECT count(*), round(sum(weight)), round(median(weight), 1)
        FROM device_weights""").fetchone()
    print(f"[build] device_weights: {n[0]:,} devices, weighted pop {n[1]:,.0f}, median w {n[2]}", flush=True)


def build_feed_hour_weights(con: duckdb.DuckDBPyConnection) -> None:
    # Match the agg feed's hour-of-day device-count *shape* to the sdk/app
    # shape: weight(h) = sdk_share(h) / agg_share(h). A corrected agg count for
    # hour h is then count(h) * weight(h).
    con.execute("""
        CREATE OR REPLACE TABLE feed_hour_weights AS
        WITH hourly AS (
          SELECT hour(ts) AS h,
                 CASE WHEN dayofweek(ts) IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
                 count(DISTINCT device_id) FILTER (source_type = 'agg') AS agg_dev,
                 count(DISTINCT device_id) FILTER (source_type IN ('sdk','app')) AS sdk_dev
          FROM pings GROUP BY 1, 2
        ),
        shares AS (
          SELECT h, daytype,
                 agg_dev / sum(agg_dev) OVER (PARTITION BY daytype) AS agg_share,
                 sdk_dev / sum(sdk_dev) OVER (PARTITION BY daytype) AS sdk_share
          FROM hourly
        )
        SELECT h, daytype,
               round(sdk_share / agg_share, 4) AS weight
        FROM shares""")
    chk = con.execute("""
        SELECT min(weight), max(weight) FROM feed_hour_weights""").fetchone()
    print(f"[build] feed_hour_weights: 48 rows, weight range {chk[0]}..{chk[1]}", flush=True)


def build_weights(con: duckdb.DuckDBPyConnection) -> None:
    build_device_weights(con)
    build_feed_hour_weights(con)
