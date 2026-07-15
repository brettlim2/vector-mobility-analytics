"""Household / co-movement inference — warehouse counts only.

Candidates: devices sharing a rounded home cell. Strengthened by co-located
stop overlaps. Colleague-like: shared work cell / work_pa + weekday co-presence.

Privacy (hard rules):
  - Intermediate pair tables may exist in the warehouse for counting.
  - Exports are **distributions and rates only** — never device-pair lists,
    never named households (see insights.run_household).
  - All exported cells use MIN_K_ANON.
"""

from __future__ import annotations

import duckdb


def build_household(con: duckdb.DuckDBPyConnection) -> None:
    # Home-cell occupancy
    con.execute("""
        CREATE OR REPLACE TABLE home_cell_occupancy AS
        SELECT round(hlat, 4) AS hlat, round(hlng, 4) AS hlng,
               count(*) AS n_devices,
               count(*) FILTER (work_pa IS NOT NULL) AS n_with_work
        FROM device_features
        WHERE hlat IS NOT NULL
        GROUP BY 1, 2""")

    # Pair candidates only in small multi-device homes (2–6 devices) —
    # larger cells are dorms/hotels, not households.
    con.execute("""
        CREATE OR REPLACE TEMP TABLE hh_pairs AS
        SELECT a.device_id AS device_a, b.device_id AS device_b,
               round(a.hlat, 4) AS hlat, round(a.hlng, 4) AS hlng,
               (a.work_pa IS NOT NULL AND b.work_pa IS NOT NULL) AS dual_income
        FROM device_features a
        JOIN device_features b
          ON round(a.hlat, 4) = round(b.hlat, 4)
         AND round(a.hlng, 4) = round(b.hlng, 4)
         AND a.device_id < b.device_id
        JOIN home_cell_occupancy o
          ON o.hlat = round(a.hlat, 4) AND o.hlng = round(a.hlng, 4)
        WHERE a.hlat IS NOT NULL AND o.n_devices BETWEEN 2 AND 6""")

    # Co-located stop overlaps (same ~110 m cell, overlapping time, same day)
    con.execute("""
        CREATE OR REPLACE TEMP TABLE co_stops AS
        SELECT p.device_a, p.device_b,
               count(*) AS co_stop_events,
               count(DISTINCT s1.d) AS co_days,
               count(DISTINCT s1.d) FILTER (s1.dow IN (0, 6)) AS co_weekend_days
        FROM hh_pairs p
        JOIN stops s1 ON s1.device_id = p.device_a AND s1.dwell_min >= 15
        JOIN stops s2 ON s2.device_id = p.device_b
          AND s1.d = s2.d
          AND round(s1.lat, 3) = round(s2.lat, 3)
          AND round(s1.lng, 3) = round(s2.lng, 3)
          AND s1.start_ts < s2.end_ts AND s2.start_ts < s1.end_ts
          AND s2.dwell_min >= 15
        GROUP BY 1, 2""")

    # Likely household pairs: shared home + ≥2 co-days
    con.execute("""
        CREATE OR REPLACE TABLE household_pairs AS
        SELECT p.device_a, p.device_b, p.hlat, p.hlng, p.dual_income,
               coalesce(c.co_days, 0) AS co_days,
               coalesce(c.co_weekend_days, 0) AS co_weekend_days,
               coalesce(c.co_stop_events, 0) AS co_stop_events
        FROM hh_pairs p
        LEFT JOIN co_stops c USING (device_a, device_b)
        WHERE coalesce(c.co_days, 0) >= 2""")

    # Colleague-like: same work_pa + same ~110m work cell, different home
    con.execute("""
        CREATE OR REPLACE TABLE colleague_pairs AS
        WITH work_devs AS (
          SELECT device_id, work_pa,
                 round(median(lat), 3) AS wlat, round(median(lng), 3) AS wlng
          FROM stops s JOIN device_features f USING (device_id)
          WHERE f.work_pa IS NOT NULL
            AND s.start_hour BETWEEN 9 AND 17 AND s.dow BETWEEN 1 AND 5
            AND s.dwell_min >= 60
          GROUP BY device_id, work_pa
        ),
        cell_sizes AS (
          SELECT work_pa, wlat, wlng, count(*) AS n
          FROM work_devs GROUP BY 1, 2, 3 HAVING count(*) BETWEEN 2 AND 40
        )
        SELECT a.device_id AS device_a, b.device_id AS device_b, a.work_pa
        FROM work_devs a
        JOIN cell_sizes cs USING (work_pa, wlat, wlng)
        JOIN work_devs b
          ON a.work_pa = b.work_pa AND a.wlat = b.wlat AND a.wlng = b.wlng
         AND a.device_id < b.device_id
        JOIN device_features fa ON fa.device_id = a.device_id
        JOIN device_features fb ON fb.device_id = b.device_id
        WHERE fa.hlat IS NULL OR fb.hlat IS NULL
           OR round(fa.hlat, 4) != round(fb.hlat, 4)
           OR round(fa.hlng, 4) != round(fb.hlng, 4)""")

    # Cohort summary tables for export (no device IDs)
    con.execute("""
        CREATE OR REPLACE TABLE household_cohorts AS
        SELECT
          CASE
            WHEN n_devices = 1 THEN '1'
            WHEN n_devices = 2 THEN '2'
            WHEN n_devices = 3 THEN '3'
            WHEN n_devices BETWEEN 4 AND 5 THEN '4-5'
            ELSE '6+'
          END AS household_size_band,
          count(*) AS n_home_cells,
          sum(n_devices) AS n_devices,
          sum(n_with_work) AS n_with_work
        FROM home_cell_occupancy
        GROUP BY 1""")

    n_hh = con.execute("SELECT count(*) FROM household_pairs").fetchone()[0]
    n_col = con.execute("SELECT count(*) FROM colleague_pairs").fetchone()[0]
    print(f"[build] household_pairs: {n_hh:,} (warehouse only); "
          f"colleague_pairs: {n_col:,} (warehouse only)", flush=True)
