"""Trip purpose inference and tour chaining.

trip_purpose — every trip labelled by its destination context:
    home / work / education / dining / shopping_errands / leisure / health /
    transit_travel / services / other_visit / other
Home and work anchors are matched by proximity (<=400 m / <=500 m); everything
else falls through to the destination stop's attributed POI category.

tours — home-anchored chains: a tour runs from leaving home to next arriving
home within a device-day. Classified simple_commute / commute_plus /
errand_leisure / complex.
"""

from __future__ import annotations

import duckdb


def build_trip_purpose(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE OR REPLACE TABLE trip_purpose AS
        WITH home AS (
          SELECT device_id, hlat, hlng FROM device_features WHERE hlat IS NOT NULL
        ),
        work AS (
          SELECT device_id, median(lat) AS wlat, median(lng) AS wlng
          FROM stops
          WHERE start_hour BETWEEN 9 AND 17 AND dow BETWEEN 1 AND 5 AND dwell_min >= 60
          GROUP BY 1 HAVING count(DISTINCT d) >= 3
        ),
        dest AS (
          SELECT t.*, s.dwell_min AS dest_dwell_min,
                 s.lat AS dest_lat, s.lng AS dest_lng,
                 v.poi_group
          FROM trips t
          JOIN stops s ON s.device_id = t.device_id AND s.start_ts = t.arrive_ts
          LEFT JOIN visits v ON v.device_id = t.device_id AND v.start_ts = t.arrive_ts
        )
        SELECT d.*,
          CASE
            WHEN h.device_id IS NOT NULL
                 AND hav_m(d.dest_lat, d.dest_lng, h.hlat, h.hlng) <= 400 THEN 'home'
            WHEN w.device_id IS NOT NULL
                 AND hav_m(d.dest_lat, d.dest_lng, w.wlat, w.wlng) <= 500
                 AND d.dest_dwell_min >= 60 THEN 'work'
            WHEN d.poi_group = 'Education' THEN 'education'
            WHEN d.poi_group = 'Food & Drink' THEN 'dining'
            WHEN d.poi_group IN ('Shopping', 'Lifestyle Services') THEN 'shopping_errands'
            WHEN d.poi_group IN ('Sports & Recreation', 'Arts & Entertainment',
                                 'Cultural & Historic', 'Geographic') THEN 'leisure'
            WHEN d.poi_group = 'Health Care' THEN 'health'
            WHEN d.poi_group IN ('Transport & Travel', 'Lodging') THEN 'transit_travel'
            WHEN d.poi_group IN ('Services & Business', 'Community & Government') THEN 'services'
            WHEN d.poi_group IS NOT NULL THEN 'other_visit'
            ELSE 'other'
          END AS purpose
        FROM dest d
        LEFT JOIN home h USING (device_id)
        LEFT JOIN work w USING (device_id)""")


def build_tours(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE OR REPLACE TABLE tours AS
        WITH lagged AS (
          SELECT device_id, d, depart_ts, purpose,
                 lag(purpose) OVER (PARTITION BY device_id, d ORDER BY depart_ts) AS prev_purpose
          FROM trip_purpose
        ),
        seq AS (
          SELECT *,
                 -- a new tour starts with the first trip after an at-home arrival
                 sum(CASE WHEN prev_purpose = 'home' OR prev_purpose IS NULL
                          THEN 1 ELSE 0 END)
                   OVER (PARTITION BY device_id, d ORDER BY depart_ts
                         ROWS UNBOUNDED PRECEDING) AS tour_id
          FROM lagged
        )
        SELECT device_id, d, tour_id,
               min(depart_ts) AS start_ts,
               count(*) AS legs,
               count(*) FILTER (purpose = 'work') > 0 AS has_work,
               bool_or(purpose = 'home') AS returned_home,
               list(purpose ORDER BY depart_ts) AS purposes,
               CASE
                 WHEN count(*) FILTER (purpose = 'work') > 0 AND count(*) <= 2 THEN 'simple_commute'
                 WHEN count(*) FILTER (purpose = 'work') > 0 THEN 'commute_plus'
                 WHEN count(*) <= 2 THEN 'errand_leisure'
                 ELSE 'complex'
               END AS tour_type
        FROM seq
        GROUP BY 1, 2, 3""")


def build_purpose(con: duckdb.DuckDBPyConnection) -> None:
    build_trip_purpose(con)
    n = con.execute("SELECT count(*) FROM trip_purpose").fetchone()[0]
    print(f"[build] trip_purpose: {n:,} rows", flush=True)
    build_tours(con)
    n = con.execute("SELECT count(*) FROM tours").fetchone()[0]
    print(f"[build] tours: {n:,} rows", flush=True)
