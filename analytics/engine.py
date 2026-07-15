"""Warehouse builder: raw Veraset parquet -> cleaned DuckDB tables.

Tables produced in data/veraset.duckdb:
    pings   - cleaned, deduped, typed pings (device_id is a 64-bit hash of ad_id)
    devices - per-device stats + trajectory-eligibility flag
    stops   - dwell locations from segmenting each trajectory device's ping stream
    trips   - movements between consecutive stops
    zones   - named Singapore area centroids (see zones.py)

All timestamps in behavioural columns are Singapore local time (UTC+8).
"""

from __future__ import annotations

import time

import duckdb

from . import (
    DB_PATH,
    MAX_ACCURACY_M,
    MIN_HOURS_TRAJ,
    MIN_PINGS_TRAJ,
    PARQUET_GLOB,
    STOP_MAX_GAP_MIN,
    STOP_MIN_DWELL_MIN,
    STOP_RADIUS_M,
    TZ_OFFSET_HOURS,
)
from .zones import zones_sql_values


def connect(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    from . import ROOT

    con = duckdb.connect(str(DB_PATH), read_only=read_only)
    con.execute("SET memory_limit='9GB'")
    con.execute("SET preserve_insertion_order=false")
    # Keep spill files writable in this app's data dir (warehouse may be read-only elsewhere).
    tmp = ROOT / "data" / "duckdb_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con.execute(f"SET temp_directory='{tmp}'")
    _register_macros(con)
    return con


def _register_macros(con: duckdb.DuckDBPyConnection) -> None:
    # Haversine distance in metres
    con.execute(
        """
        CREATE OR REPLACE TEMPORARY MACRO hav_m(lat1, lng1, lat2, lng2) AS
          2 * 6371000.0 * asin(sqrt(
            pow(sin(radians(lat2 - lat1) / 2), 2) +
            cos(radians(lat1)) * cos(radians(lat2)) *
            pow(sin(radians(lng2 - lng1) / 2), 2)
          ))
        """
    )


def _step(con: duckdb.DuckDBPyConnection, name: str, sql: str) -> None:
    t0 = time.time()
    con.execute(sql)
    n = con.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
    print(f"[build] {name}: {n:,} rows in {time.time() - t0:,.1f}s", flush=True)


def _count(con: duckdb.DuckDBPyConnection, name: str) -> None:
    n = con.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
    print(f"[build] {name}: {n:,} rows", flush=True)


def build_zones(con: duckdb.DuckDBPyConnection) -> None:
    _step(
        con,
        "zones",
        f"CREATE OR REPLACE TABLE zones AS SELECT * FROM {zones_sql_values()}",
    )


def build_pings(con: duckdb.DuckDBPyConnection) -> None:
    _step(
        con,
        "pings",
        f"""
        CREATE OR REPLACE TABLE pings AS
        SELECT
          hash(ad_id)                                        AS device_id,
          any_value(utc_timestamp + INTERVAL {TZ_OFFSET_HOURS} HOUR)::TIMESTAMP AS ts,
          lat,
          lng,
          any_value(acc)                                     AS accuracy_m,
          any_value(id_type)                                 AS id_type,
          any_value(quality_fields['source_type'])           AS source_type,
          any_value(quality_fields['ha_type'])               AS ha_type,
          any_value(geo_fields['h3_res10'])                  AS h3_10,
          any_value(substring(geo_fields['geohash'], 1, 6))  AS gh6
        FROM (
          SELECT
            *,
            try_cast(latitude AS DOUBLE)  AS lat,
            try_cast(longitude AS DOUBLE) AS lng,
            try_cast(horizontal_accuracy AS DOUBLE) AS acc
          FROM read_parquet('{PARQUET_GLOB}')
          WHERE iso_country_code = 'SG'
        )
        WHERE lat IS NOT NULL AND lng IS NOT NULL
          AND lat BETWEEN 1.1 AND 1.5 AND lng BETWEEN 103.5 AND 104.2
          AND acc IS NOT NULL AND acc >= 0 AND acc <= {MAX_ACCURACY_M}
        GROUP BY device_id, utc_timestamp, lat, lng
        """,
    )


def build_devices(con: duckdb.DuckDBPyConnection) -> None:
    _step(
        con,
        "devices",
        f"""
        CREATE OR REPLACE TABLE devices AS
        SELECT
          device_id,
          count(*)                              AS pings,
          min(ts)                               AS first_ts,
          max(ts)                               AS last_ts,
          count(DISTINCT ts::DATE)              AS active_days,
          count(DISTINCT date_trunc('hour', ts)) AS active_hours,
          median(accuracy_m)                    AS med_accuracy_m,
          any_value(id_type)                    AS id_type,
          mode(source_type)                     AS main_source,
          count(DISTINCT substring(gh6, 1, 5))  AS gh5_cells,
          (count(*) >= {MIN_PINGS_TRAJ}
           AND count(DISTINCT date_trunc('hour', ts)) >= {MIN_HOURS_TRAJ}) AS traj_ok
        FROM pings
        GROUP BY device_id
        """,
    )


def build_stops(con: duckdb.DuckDBPyConnection) -> None:
    # Segment each trajectory device's ping stream: a new segment starts on a
    # jump > STOP_RADIUS_M from the previous ping or a gap > STOP_MAX_GAP_MIN.
    # Segments that dwell >= STOP_MIN_DWELL_MIN within a tight bounding box are stops.
    _step(
        con,
        "stops",
        f"""
        CREATE OR REPLACE TABLE stops AS
        WITH seq AS (
          SELECT
            p.device_id, p.ts, p.lat, p.lng,
            lag(p.lat) OVER w AS plat,
            lag(p.lng) OVER w AS plng,
            lag(p.ts)  OVER w AS pts
          FROM pings p
          JOIN devices d USING (device_id)
          WHERE d.traj_ok
          WINDOW w AS (PARTITION BY p.device_id ORDER BY p.ts)
        ),
        flagged AS (
          SELECT *,
            CASE WHEN pts IS NULL
                   OR hav_m(plat, plng, lat, lng) > {STOP_RADIUS_M}
                   OR date_diff('minute', pts, ts) > {STOP_MAX_GAP_MIN}
                 THEN 1 ELSE 0 END AS new_seg
          FROM seq
        ),
        segmented AS (
          SELECT *,
            sum(new_seg) OVER (PARTITION BY device_id ORDER BY ts
                               ROWS UNBOUNDED PRECEDING) AS seg_id
          FROM flagged
        ),
        segs AS (
          SELECT
            device_id, seg_id,
            min(ts) AS start_ts,
            max(ts) AS end_ts,
            date_diff('second', min(ts), max(ts)) / 60.0 AS dwell_min,
            avg(lat) AS lat,
            avg(lng) AS lng,
            count(*) AS n_pings,
            hav_m(min(lat), min(lng), max(lat), max(lng)) AS bbox_diag_m
          FROM segmented
          GROUP BY device_id, seg_id
        )
        SELECT
          device_id, start_ts, end_ts, dwell_min, lat, lng, n_pings,
          hour(start_ts) AS start_hour,
          dayofweek(start_ts) AS dow,          -- 0=Sun .. 6=Sat
          start_ts::DATE AS d
        FROM segs
        WHERE dwell_min >= {STOP_MIN_DWELL_MIN}
          AND bbox_diag_m <= 600
          AND n_pings >= 3
        """,
    )
    # Label each stop with the nearest named zone via a coarse-grid lookup
    _step(
        con,
        "stop_zone_grid",
        """
        CREATE OR REPLACE TABLE stop_zone_grid AS
        WITH cells AS (
          SELECT DISTINCT round(lat, 3) AS clat, round(lng, 3) AS clng FROM stops
        )
        SELECT
          clat, clng,
          min_by(z.zone, hav_m(clat, clng, z.zlat, z.zlng)) AS zone,
          min_by(z.kind, hav_m(clat, clng, z.zlat, z.zlng)) AS kind
        FROM cells CROSS JOIN zones z
        GROUP BY clat, clng
        """,
    )
    con.execute(
        """
        ALTER TABLE stops ADD COLUMN IF NOT EXISTS zone VARCHAR;
        ALTER TABLE stops ADD COLUMN IF NOT EXISTS zone_kind VARCHAR;
        UPDATE stops s SET
          zone = g.zone,
          zone_kind = g.kind
        FROM stop_zone_grid g
        WHERE round(s.lat, 3) = g.clat AND round(s.lng, 3) = g.clng
        """
    )
    print("[build] stops labelled with zones", flush=True)


def build_trips(con: duckdb.DuckDBPyConnection) -> None:
    _step(
        con,
        "trips",
        """
        CREATE OR REPLACE TABLE trips AS
        WITH ordered AS (
          SELECT *,
            lead(start_ts) OVER w AS next_start,
            lead(lat)  OVER w AS next_lat,
            lead(lng)  OVER w AS next_lng,
            lead(zone) OVER w AS next_zone,
            lead(zone_kind) OVER w AS next_kind
          FROM stops
          WINDOW w AS (PARTITION BY device_id ORDER BY start_ts)
        )
        SELECT
          device_id,
          end_ts   AS depart_ts,
          next_start AS arrive_ts,
          date_diff('second', end_ts, next_start) / 60.0 AS travel_min,
          hav_m(lat, lng, next_lat, next_lng) / 1000.0   AS dist_km,
          lat AS o_lat, lng AS o_lng, zone AS o_zone, zone_kind AS o_kind,
          next_lat AS d_lat, next_lng AS d_lng, next_zone AS d_zone, next_kind AS d_kind,
          hour(end_ts) AS depart_hour,
          dayofweek(end_ts) AS dow,
          end_ts::DATE AS d
        FROM ordered
        WHERE next_start IS NOT NULL
          AND date_diff('second', end_ts, next_start) BETWEEN 120 AND 6*3600
          AND hav_m(lat, lng, next_lat, next_lng) >= 400
        """,
    )


def build(steps: list[str] | None = None) -> None:
    from .acra import build_acra
    from .datagov import build_context, build_stop_pa
    from .household import build_household
    from .lifestage import build_lifestage
    from .overture import build_pois, build_visits
    from .purpose import build_purpose
    from .segments import build_segments
    from .sequences import build_sequences
    from .ses import build_ses
    from .weighting import build_weights

    con = connect()
    all_steps = {
        "zones": build_zones,
        "pings": build_pings,
        "devices": build_devices,
        "stops": build_stops,
        "trips": build_trips,
        "pois": lambda c: (build_pois(c), _count(c, "pois")),
        "visits": lambda c: (build_visits(c), _count(c, "visits")),
        "context": build_context,
        "stop_pa": build_stop_pa,
        "segments": build_segments,
        "weights": build_weights,
        "purpose": build_purpose,
        "ses": build_ses,
        "acra": build_acra,
        "lifestage": build_lifestage,
        "household": build_household,
        "sequences": build_sequences,
    }
    for name, fn in all_steps.items():
        if steps and name not in steps:
            continue
        fn(con)
    con.close()
    print("[build] done", flush=True)
