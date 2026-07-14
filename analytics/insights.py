"""Analyses over the warehouse. Each returns JSON-serialisable data and is
written to data/analytics_out/<name>.json by run_all().

Privacy: every aggregate that exposes a location is suppressed below
MIN_K_ANON distinct devices. No individual trajectories are exported.
"""

from __future__ import annotations

import json
import time
from typing import Any, Callable

import duckdb

from . import MIN_K_ANON, OUT_DIR
from .engine import connect

K = MIN_K_ANON


def rows(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
    cur = con.sql(sql)
    cols = cur.columns
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def one(con: duckdb.DuckDBPyConnection, sql: str) -> dict[str, Any]:
    r = rows(con, sql)
    return r[0] if r else {}


# ---------------------------------------------------------------- profile

def run_profile(con: duckdb.DuckDBPyConnection | None = None) -> dict:
    con = con or connect(read_only=True)
    return {
        "totals": one(con, """
            SELECT count(*) AS pings,
                   count(DISTINCT device_id) AS devices,
                   min(ts) AS first_ts, max(ts) AS last_ts
            FROM pings"""),
        "per_day": rows(con, """
            SELECT ts::DATE AS d, count(*) AS pings, count(DISTINCT device_id) AS devices
            FROM pings GROUP BY 1 ORDER BY 1"""),
        "source_mix": rows(con, """
            SELECT source_type, count(*) AS pings, count(DISTINCT device_id) AS devices
            FROM pings GROUP BY 1 ORDER BY 2 DESC"""),
        "id_mix": rows(con, "SELECT id_type, count(DISTINCT device_id) AS devices FROM pings GROUP BY 1 ORDER BY 2 DESC"),
        "accuracy_quantiles_m": one(con, """
            SELECT round(quantile_cont(accuracy_m, 0.25),1) AS p25,
                   round(quantile_cont(accuracy_m, 0.50),1) AS p50,
                   round(quantile_cont(accuracy_m, 0.75),1) AS p75,
                   round(quantile_cont(accuracy_m, 0.95),1) AS p95
            FROM pings"""),
        "pings_per_device": one(con, """
            SELECT round(avg(pings),1) AS mean,
                   quantile_cont(pings, 0.5) AS p50,
                   quantile_cont(pings, 0.9) AS p90,
                   quantile_cont(pings, 0.99) AS p99,
                   max(pings) AS max
            FROM devices"""),
        "device_depth": one(con, """
            SELECT count(*) FILTER (pings = 1) AS single_ping,
                   count(*) FILTER (pings BETWEEN 2 AND 19) AS light,
                   count(*) FILTER (traj_ok) AS trajectory_grade,
                   count(*) FILTER (active_days >= 5) AS active_5plus_days
            FROM devices"""),
        "warehouse": rows(con, """
            SELECT 'stops' AS tbl, count(*) AS n FROM stops
            UNION ALL SELECT 'trips', count(*) FROM trips
            UNION ALL SELECT 'traj_devices', count(*) FROM devices WHERE traj_ok"""),
    }


# ---------------------------------------------------------------- rhythms

def run_rhythms(con) -> dict:
    return {
        "hourly": rows(con, """
            SELECT hour(ts) AS h,
                   CASE WHEN dayofweek(ts) IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
                   count(*) / count(DISTINCT ts::DATE) AS pings_per_day,
                   count(DISTINCT device_id) AS devices
            FROM pings GROUP BY 1, 2 ORDER BY 2, 1"""),
        "stop_starts_hourly": rows(con, """
            SELECT start_hour AS h,
                   CASE WHEN dow IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
                   count(*) / count(DISTINCT d) AS stops_per_day
            FROM stops GROUP BY 1, 2 ORDER BY 2, 1"""),
        "trip_departures_hourly": rows(con, """
            SELECT depart_hour AS h,
                   CASE WHEN dow IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
                   count(*) / count(DISTINCT d) AS trips_per_day
            FROM trips GROUP BY 1, 2 ORDER BY 2, 1"""),
    }


# ---------------------------------------------------------------- hotspots

DAYPARTS = """
CASE
  WHEN hour(ts) BETWEEN 7 AND 9   THEN 'am_peak'
  WHEN hour(ts) BETWEEN 10 AND 16 THEN 'midday'
  WHEN hour(ts) BETWEEN 17 AND 20 THEN 'pm_peak'
  WHEN hour(ts) BETWEEN 21 AND 23 THEN 'evening'
  ELSE 'night'
END"""


def run_hotspots(con) -> dict:
    return {
        "top_cells": rows(con, f"""
            WITH cells AS (
              SELECT gh6,
                     round(avg(lat), 5) AS lat, round(avg(lng), 5) AS lng,
                     count(DISTINCT device_id) AS devices, count(*) AS pings
              FROM pings
              GROUP BY gh6
              HAVING count(DISTINCT device_id) >= {K}
              ORDER BY devices DESC LIMIT 40
            )
            SELECT c.gh6, c.lat, c.lng, c.devices, c.pings,
                   min_by(z.zone, hav_m(c.lat, c.lng, z.zlat, z.zlng)) AS zone
            FROM cells c CROSS JOIN zones z
            GROUP BY ALL ORDER BY devices DESC"""),
        "top_cells_by_daypart": rows(con, f"""
            WITH cell_part AS (
              SELECT gh6, {DAYPARTS} AS daypart,
                     round(avg(lat),5) AS lat, round(avg(lng),5) AS lng,
                     count(DISTINCT device_id) AS devices
              FROM pings GROUP BY 1, 2
              HAVING count(DISTINCT device_id) >= {K}
            ),
            ranked AS (
              SELECT *, row_number() OVER (PARTITION BY daypart ORDER BY devices DESC) AS rk
              FROM cell_part
            )
            SELECT r.daypart, r.gh6, r.lat, r.lng, r.devices,
                   min_by(z.zone, hav_m(r.lat, r.lng, z.zlat, z.zlng)) AS zone
            FROM ranked r CROSS JOIN zones z
            WHERE rk <= 12
            GROUP BY ALL ORDER BY daypart, devices DESC"""),
        "grid_density": rows(con, f"""
            SELECT round(lat, 3) AS lat, round(lng, 3) AS lng,
                   count(DISTINCT device_id) AS devices
            FROM pings
            GROUP BY 1, 2
            HAVING count(DISTINCT device_id) >= {K}
            ORDER BY devices DESC LIMIT 4000"""),
    }


# ---------------------------------------------------------------- zone activity

def run_zone_activity(con) -> dict:
    return {
        "by_zone": rows(con, f"""
            WITH peak AS (
              SELECT zone, arg_max(start_hour, cnt) AS peak_hour
              FROM (SELECT zone, start_hour, count(*) AS cnt FROM stops GROUP BY 1, 2)
              GROUP BY zone
            )
            SELECT s.zone, any_value(s.zone_kind) AS kind,
                   count(DISTINCT s.device_id) AS devices,
                   count(*) AS stops,
                   round(median(s.dwell_min), 1) AS med_dwell_min,
                   any_value(p.peak_hour) AS peak_hour
            FROM stops s JOIN peak p USING (zone)
            GROUP BY s.zone
            HAVING count(DISTINCT s.device_id) >= {K}
            ORDER BY devices DESC"""),
        "day_night": rows(con, f"""
            SELECT zone,
                   count(DISTINCT device_id) FILTER (start_hour BETWEEN 9 AND 17) AS day_devices,
                   count(DISTINCT device_id) FILTER (start_hour >= 21 OR start_hour <= 5) AS night_devices
            FROM stops
            GROUP BY zone
            HAVING day_devices >= {K} AND night_devices >= {K}
            ORDER BY day_devices DESC"""),
        "weekend_shift": rows(con, f"""
            SELECT zone,
                   count(DISTINCT device_id) FILTER (dow BETWEEN 1 AND 5) / 5.0 AS wkday_devices_per_day,
                   count(DISTINCT device_id) FILTER (dow IN (0,6)) / 2.0 AS wkend_devices_per_day
            FROM stops
            GROUP BY zone
            HAVING count(DISTINCT device_id) >= {K * 4}
            ORDER BY wkend_devices_per_day / nullif(wkday_devices_per_day, 0) DESC"""),
    }


# ---------------------------------------------------------------- OD flows

def run_od_flows(con) -> dict:
    base = f"""
        SELECT o_zone, d_zone,
               count(*) AS trips,
               count(DISTINCT device_id) AS devices,
               round(median(travel_min), 1) AS med_travel_min,
               round(median(dist_km), 2) AS med_dist_km,
               round(median(dist_km / (travel_min / 60.0)), 1) AS med_speed_kmh
        FROM trips
        WHERE o_zone != d_zone {{extra}}
        GROUP BY 1, 2
        HAVING count(DISTINCT device_id) >= {K}
        ORDER BY trips DESC LIMIT {{lim}}"""
    return {
        "top_corridors": rows(con, base.format(extra="", lim=40)),
        "am_peak_weekday": rows(con, base.format(
            extra="AND depart_hour BETWEEN 6 AND 9 AND dow BETWEEN 1 AND 5", lim=25)),
        "pm_peak_weekday": rows(con, base.format(
            extra="AND depart_hour BETWEEN 17 AND 20 AND dow BETWEEN 1 AND 5", lim=25)),
        "late_night": rows(con, base.format(
            extra="AND (depart_hour >= 23 OR depart_hour <= 4)", lim=15)),
    }


# ---------------------------------------------------------------- home / work

def run_home_work(con) -> dict:
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE hw AS
        WITH night AS (
          SELECT device_id, mode(zone) AS home_zone
          FROM stops
          WHERE (start_hour >= 21 OR start_hour <= 5) AND dwell_min >= 30
          GROUP BY 1 HAVING count(*) >= 3
        ),
        work AS (
          SELECT device_id, mode(zone) AS work_zone
          FROM stops
          WHERE start_hour BETWEEN 9 AND 17 AND dow BETWEEN 1 AND 5 AND dwell_min >= 60
          GROUP BY 1 HAVING count(*) >= 3
        )
        SELECT n.device_id, home_zone, work_zone
        FROM night n JOIN work w USING (device_id)""")
    return {
        "devices_classified": one(con, "SELECT count(*) AS n, count(*) FILTER (home_zone != work_zone) AS commuters FROM hw"),
        "top_home_zones": rows(con, f"""
            SELECT home_zone AS zone, count(*) AS devices FROM hw
            GROUP BY 1 HAVING count(*) >= {K} ORDER BY 2 DESC LIMIT 20"""),
        "top_work_zones": rows(con, f"""
            SELECT work_zone AS zone, count(*) AS devices FROM hw
            GROUP BY 1 HAVING count(*) >= {K} ORDER BY 2 DESC LIMIT 20"""),
        "commute_flows": rows(con, f"""
            SELECT home_zone, work_zone, count(*) AS devices
            FROM hw WHERE home_zone != work_zone
            GROUP BY 1, 2 HAVING count(*) >= {K}
            ORDER BY 3 DESC LIMIT 40"""),
        "commute_distance_km": one(con, """
            SELECT round(quantile_cont(dist, 0.25), 1) AS p25,
                   round(quantile_cont(dist, 0.5), 1) AS p50,
                   round(quantile_cont(dist, 0.75), 1) AS p75,
                   round(quantile_cont(dist, 0.9), 1) AS p90
            FROM (
              SELECT hav_m(zh.zlat, zh.zlng, zw.zlat, zw.zlng) / 1000.0 AS dist
              FROM hw
              JOIN zones zh ON zh.zone = home_zone
              JOIN zones zw ON zw.zone = work_zone
              WHERE home_zone != work_zone
            )"""),
    }


# ---------------------------------------------------------------- movement

def run_movement(con) -> dict:
    return {
        "trip_distance_km": one(con, """
            SELECT round(quantile_cont(dist_km, 0.25),2) AS p25,
                   round(quantile_cont(dist_km, 0.5),2) AS p50,
                   round(quantile_cont(dist_km, 0.75),2) AS p75,
                   round(quantile_cont(dist_km, 0.95),2) AS p95,
                   count(*) AS trips FROM trips"""),
        "trip_speed_bands": rows(con, """
            SELECT CASE
                     WHEN kmh < 5 THEN 'walk (<5 km/h)'
                     WHEN kmh < 15 THEN 'slow / mixed (5-15)'
                     WHEN kmh < 35 THEN 'road / transit (15-35)'
                     ELSE 'fast (>35 km/h)'
                   END AS band,
                   count(*) AS trips,
                   round(median(dist_km), 2) AS med_dist_km
            FROM (SELECT dist_km, dist_km / (travel_min / 60.0) AS kmh FROM trips)
            GROUP BY 1 ORDER BY trips DESC"""),
        "radius_of_gyration_km": one(con, """
            WITH cent AS (
              SELECT device_id, avg(lat) clat, avg(lng) clng FROM stops GROUP BY 1
            ),
            rog AS (
              SELECT s.device_id,
                     sqrt(avg(pow(hav_m(s.lat, s.lng, c.clat, c.clng), 2))) / 1000.0 AS rog_km
              FROM stops s JOIN cent c USING (device_id)
              GROUP BY 1 HAVING count(*) >= 5
            )
            SELECT count(*) AS devices,
                   round(quantile_cont(rog_km, 0.25),2) AS p25,
                   round(quantile_cont(rog_km, 0.5),2) AS p50,
                   round(quantile_cont(rog_km, 0.75),2) AS p75,
                   round(quantile_cont(rog_km, 0.95),2) AS p95
            FROM rog"""),
        "trips_per_active_device_day": one(con, """
            SELECT round(count(*)::DOUBLE / count(DISTINCT (device_id, d)), 2) AS trips
            FROM trips"""),
    }


# ---------------------------------------------------------------- dwell

def run_dwell(con) -> dict:
    return {
        "by_kind": rows(con, """
            SELECT zone_kind AS kind, count(*) AS stops,
                   round(median(dwell_min),1) AS med_dwell_min,
                   round(quantile_cont(dwell_min, 0.9),1) AS p90_dwell_min
            FROM stops GROUP BY 1 ORDER BY stops DESC"""),
        "longest_dwell_zones": rows(con, f"""
            SELECT zone, count(*) AS stops, count(DISTINCT device_id) AS devices,
                   round(median(dwell_min),1) AS med_dwell_min
            FROM stops GROUP BY 1
            HAVING count(DISTINCT device_id) >= {K * 10}
            ORDER BY med_dwell_min DESC LIMIT 15"""),
        "dwell_distribution": rows(con, """
            SELECT CASE
                     WHEN dwell_min < 30 THEN '15-30 min'
                     WHEN dwell_min < 60 THEN '30-60 min'
                     WHEN dwell_min < 180 THEN '1-3 h'
                     WHEN dwell_min < 480 THEN '3-8 h'
                     ELSE '8+ h'
                   END AS bucket, count(*) AS stops
            FROM stops GROUP BY 1 ORDER BY min(dwell_min)"""),
    }


# ---------------------------------------------------------------- anomalies

def run_anomalies(con) -> dict:
    return {
        "burst_events": rows(con, f"""
            -- Baseline is the same hour-of-day in the same cell across the week,
            -- which cancels both the diurnal cycle and the agg feed's UTC-day
            -- reset decay (see data_quality.utc_midnight_step).
            WITH hex_hour AS (
              SELECT gh6, date_trunc('hour', ts) AS hh, hour(ts) AS hod,
                     count(DISTINCT device_id) AS devices,
                     round(avg(lat),5) AS lat, round(avg(lng),5) AS lng
              FROM pings GROUP BY 1, 2, 3
            ),
            stats AS (
              SELECT *,
                     median(devices) OVER (PARTITION BY gh6, hod) AS med,
                     count(*) OVER (PARTITION BY gh6, hod) AS n_days
              FROM hex_hour
            )
            SELECT s.gh6, s.hh AS hour_sgt, s.devices,
                   round(s.med, 1) AS typical_devices,
                   round(s.devices / s.med, 1) AS ratio,
                   min_by(z2.zone, hav_m(s.lat, s.lng, z2.zlat, z2.zlng)) AS zone,
                   s.lat, s.lng
            FROM stats s CROSS JOIN zones z2
            WHERE s.n_days >= 6 AND s.med >= {K}
              AND s.devices / s.med >= 3
              AND s.devices >= 50
            GROUP BY ALL
            ORDER BY ratio DESC LIMIT 25"""),
        "quietest_vs_busiest_days": rows(con, """
            SELECT ts::DATE AS d, dayname(ts::DATE) AS day,
                   count(DISTINCT device_id) AS devices
            FROM pings GROUP BY 1, 2 ORDER BY 1"""),
    }


# ---------------------------------------------------------------- POIs

def run_pois(con) -> dict:
    return {
        "hourly": rows(con, f"""
            SELECT z.zone, hour(p.ts) AS h,
                   count(DISTINCT p.device_id) AS devices
            FROM pings p
            JOIN zones z ON z.zone IN ('Changi Airport', 'Woodlands Checkpoint',
                                       'Tuas Checkpoint', 'Sentosa', 'Orchard',
                                       'Marina Bay')
                        AND hav_m(p.lat, p.lng, z.zlat, z.zlng) < 1500
            GROUP BY 1, 2 HAVING count(DISTINCT p.device_id) >= {K}
            ORDER BY 1, 2"""),
        "dwell": rows(con, f"""
            SELECT z.zone,
                   count(DISTINCT s.device_id) AS devices,
                   round(median(s.dwell_min), 1) AS med_dwell_min
            FROM stops s
            JOIN zones z ON z.zone IN ('Changi Airport', 'Woodlands Checkpoint',
                                       'Tuas Checkpoint', 'Sentosa', 'Orchard',
                                       'Marina Bay')
                        AND hav_m(s.lat, s.lng, z.zlat, z.zlng) < 1500
            GROUP BY 1 HAVING count(DISTINCT s.device_id) >= {K}"""),
    }


# ---------------------------------------------------------------- data quality

def run_data_quality(con) -> dict:
    """Feed artifacts that downstream analyses must account for."""
    return {
        # The agg feed resets at the UTC day boundary (08:00 SGT): device counts
        # step up ~2.8x at that hour while sdk/app rise smoothly. Hour-of-day
        # analytics should use sdk/app or a UTC-day-aware baseline.
        "utc_midnight_step": rows(con, """
            SELECT hour(ts) AS h,
                   count(DISTINCT device_id) FILTER (source_type = 'agg') AS agg_devices,
                   count(DISTINCT device_id) FILTER (source_type IN ('sdk','app')) AS sdk_app_devices
            FROM pings GROUP BY 1 ORDER BY 1"""),
        "hourly_sdk_app_only": rows(con, """
            SELECT hour(ts) AS h,
                   CASE WHEN dayofweek(ts) IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
                   count(DISTINCT device_id) AS devices
            FROM pings WHERE source_type IN ('sdk','app')
            GROUP BY 1, 2 ORDER BY 2, 1"""),
        "duplicate_share": one(con, """
            SELECT round(1 - count(DISTINCT (device_id, ts)) / count(*)::DOUBLE, 4) AS same_ts_share
            FROM pings"""),
    }


# ---------------------------------------------------------------- Overture POIs

def run_poi_insights(con) -> dict:
    # Fine-grained home anchor per device (median of night-stop coordinates).
    # Nearest-POI attribution otherwise credits residents dwelling at home to
    # the playground / salon / clinic at the foot of their block, so footfall
    # leaderboards only count devices with a known home that is >= 400 m from
    # the POI ("visitor footfall").
    con.execute("""
        CREATE OR REPLACE TEMP TABLE device_home AS
        SELECT device_id, median(lat) AS hlat, median(lng) AS hlng
        FROM stops
        WHERE (start_hour >= 21 OR start_hour <= 5) AND dwell_min >= 30
        GROUP BY 1 HAVING count(*) >= 3""")
    con.execute("""
        CREATE OR REPLACE TEMP VIEW visitor_visits AS
        SELECT v.*, hav_m(v.lat, v.lng, h.hlat, h.hlng) AS home_dist_m
        FROM visits v
        JOIN device_home h USING (device_id)
        WHERE hav_m(v.lat, v.lng, h.hlat, h.hlng) >= 400""")
    return {
        "attribution": one(con, f"""
            SELECT
              (SELECT count(*) FROM stops WHERE dwell_min <= 360) AS venue_like_stops,
              count(*) AS attributed_visits,
              round(count(*) / (SELECT count(*) FROM stops WHERE dwell_min <= 360)::DOUBLE, 3) AS match_rate,
              round(median(dist_m), 1) AS med_match_dist_m,
              round(median(pois_within_radius), 0) AS med_poi_candidates,
              (SELECT count(*) FROM pois) AS pois_loaded,
              (SELECT count(*) FROM visitor_visits) AS visitor_visits,
              (SELECT count(*) FROM device_home) AS devices_with_home
            FROM visits"""),
        "top_venues": rows(con, f"""
            SELECT any_value(poi_name) AS name, any_value(poi_group) AS grp,
                   any_value(poi_category) AS category,
                   count(DISTINCT device_id) AS devices, count(*) AS visits,
                   round(median(dwell_min), 1) AS med_dwell_min,
                   round(median(home_dist_m) / 1000.0, 1) AS med_home_dist_km
            FROM visitor_visits
            GROUP BY poi_id
            HAVING count(DISTINCT device_id) >= {K}
            ORDER BY devices DESC LIMIT 30"""),
        "top_brands": rows(con, f"""
            SELECT poi_name AS name,
                   count(DISTINCT poi_id) AS locations,
                   count(DISTINCT device_id) AS devices, count(*) AS visits,
                   round(median(dwell_min), 1) AS med_dwell_min
            FROM visitor_visits
            GROUP BY 1
            HAVING count(DISTINCT poi_id) >= 5 AND count(DISTINCT device_id) >= {K}
            ORDER BY devices DESC LIMIT 15"""),
        "by_group": rows(con, f"""
            SELECT poi_group AS grp,
                   count(DISTINCT device_id) AS devices, count(*) AS visits,
                   round(median(dwell_min), 1) AS med_dwell_min,
                   round(count(*) FILTER (dow IN (0,6)) / 2.0
                         / nullif(count(*) FILTER (dow BETWEEN 1 AND 5) / 5.0, 0), 2) AS weekend_ratio
            FROM visitor_visits
            GROUP BY 1 HAVING count(DISTINCT device_id) >= {K}
            ORDER BY visits DESC"""),
        "group_rhythms": rows(con, """
            SELECT poi_group AS grp, h,
                   count(*) AS occupied_visits
            FROM visitor_visits, generate_series(0, 23) AS g(h)
            WHERE h BETWEEN hour(start_ts) AND hour(end_ts)
              AND poi_group IN ('Food & Drink', 'Shopping', 'Sports & Recreation',
                                'Arts & Entertainment', 'Transport & Travel', 'Education')
            GROUP BY 1, 2 ORDER BY 1, 2"""),
        "top_by_group": rows(con, f"""
            WITH ranked AS (
              SELECT any_value(poi_group) AS grp, any_value(poi_name) AS name,
                     count(DISTINCT device_id) AS devices,
                     round(median(dwell_min), 1) AS med_dwell_min,
                     row_number() OVER (PARTITION BY any_value(poi_group)
                                        ORDER BY count(DISTINCT device_id) DESC) AS rk
              FROM visitor_visits
              GROUP BY poi_id
              HAVING count(DISTINCT device_id) >= {K}
            )
            SELECT grp, name, devices, med_dwell_min FROM ranked
            WHERE rk <= 5 ORDER BY grp, devices DESC"""),
        "catchment": rows(con, f"""
            WITH top AS (
              SELECT poi_id FROM visitor_visits
              GROUP BY 1 ORDER BY count(DISTINCT device_id) DESC LIMIT 15
            )
            SELECT any_value(v.poi_name) AS name,
                   count(DISTINCT v.device_id) AS visitors,
                   round(median(v.home_dist_m) / 1000.0, 1) AS med_home_dist_km,
                   round(count(*) FILTER (v.home_dist_m < 3000) / count(*)::DOUBLE, 2) AS share_local_3km
            FROM visitor_visits v JOIN top USING (poi_id)
            GROUP BY v.poi_id HAVING count(DISTINCT v.device_id) >= {K}
            ORDER BY med_home_dist_km DESC"""),
        "hotspot_pois": rows(con, f"""
            WITH cells AS (
              SELECT gh6, round(avg(lat), 5) AS clat, round(avg(lng), 5) AS clng,
                     count(DISTINCT device_id) AS cell_devices
              FROM pings GROUP BY gh6
              ORDER BY cell_devices DESC LIMIT 15
            ),
            ranked AS (
              SELECT c.gh6, c.cell_devices, v.poi_name,
                     count(DISTINCT v.device_id) AS poi_devices,
                     row_number() OVER (PARTITION BY c.gh6
                                        ORDER BY count(DISTINCT v.device_id) DESC) AS rk
              FROM cells c
              JOIN visitor_visits v ON hav_m(v.lat, v.lng, c.clat, c.clng) <= 700
              GROUP BY 1, 2, 3
              HAVING count(DISTINCT v.device_id) >= {K}
            )
            SELECT gh6, cell_devices, list(poi_name ORDER BY rk) AS top_pois
            FROM ranked WHERE rk <= 3
            GROUP BY 1, 2 ORDER BY cell_devices DESC"""),
    }


# ---------------------------------------------------------------- runner

ANALYSES: dict[str, Callable] = {
    "profile": run_profile,
    "rhythms": run_rhythms,
    "hotspots": run_hotspots,
    "zone_activity": run_zone_activity,
    "od_flows": run_od_flows,
    "home_work": run_home_work,
    "movement": run_movement,
    "dwell": run_dwell,
    "anomalies": run_anomalies,
    "pois": run_pois,
    "data_quality": run_data_quality,
    "poi_insights": run_poi_insights,
}


def run_all(only: list[str] | None = None) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    con = connect(read_only=True)
    for name, fn in ANALYSES.items():
        if only and name not in only:
            continue
        t0 = time.time()
        try:
            result = fn(con)
        except Exception as e:  # keep going; report at the end
            print(f"[insights] {name} FAILED: {e}", flush=True)
            continue
        out = OUT_DIR / f"{name}.json"
        out.write_text(json.dumps(result, indent=2, default=str))
        print(f"[insights] {name} -> {out.name} ({time.time() - t0:,.1f}s)", flush=True)
    con.close()
