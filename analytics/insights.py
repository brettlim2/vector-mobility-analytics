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


def _safe_rows(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
    try:
        return rows(con, sql)
    except Exception:
        return []


def _segment_tags(con) -> list[dict[str, Any]]:
    base = """
            SELECT 'foodie' AS tag, count(*) FILTER (tag_foodie) AS devices FROM device_segments
            UNION ALL SELECT 'shopper', count(*) FILTER (tag_shopper) FROM device_segments
            UNION ALL SELECT 'active_lifestyle', count(*) FILTER (tag_active_lifestyle) FROM device_segments
            UNION ALL SELECT 'night_owl', count(*) FILTER (tag_night_owl) FROM device_segments
            UNION ALL SELECT 'transit_rider', count(*) FILTER (tag_transit_rider) FROM device_segments
            UNION ALL SELECT 'hawker_regular', count(*) FILTER (tag_hawker_regular) FROM device_segments
            UNION ALL SELECT 'airport_contact', count(*) FILTER (tag_airport_contact) FROM device_segments
            UNION ALL SELECT 'worked_on_vesak', count(*) FILTER (tag_worked_on_vesak) FROM device_segments"""
    life = """
            UNION ALL SELECT 'young_family', count(*) FILTER (tag_young_family) FROM device_segments
            UNION ALL SELECT 'school_age_kids', count(*) FILTER (tag_school_age_kids) FROM device_segments
            UNION ALL SELECT 'student', count(*) FILTER (tag_student) FROM device_segments
            UNION ALL SELECT 'retiree_like', count(*) FILTER (tag_retiree_like) FROM device_segments"""
    try:
        return rows(con, base + life + " ORDER BY devices DESC")
    except Exception:
        return rows(con, base + " ORDER BY devices DESC")


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
        # v2: burst cell-hours clustered into event objects (2km bin x day),
        # with visitor origin mix and share of first-time visitors to the site
        "events": rows(con, f"""
            WITH hex_hour AS (
              SELECT gh6, date_trunc('hour', ts) AS hh, hour(ts) AS hod,
                     count(DISTINCT device_id) AS devices,
                     round(avg(lat), 5) AS lat, round(avg(lng), 5) AS lng
              FROM pings GROUP BY 1, 2, 3
            ),
            stats AS (
              SELECT *,
                     median(devices) OVER (PARTITION BY gh6, hod) AS med,
                     count(*) OVER (PARTITION BY gh6, hod) AS n_days
              FROM hex_hour
            ),
            bursts AS (
              SELECT *, round(lat / 0.02) AS by_, round(lng / 0.02) AS bx_,
                     hh::DATE AS d
              FROM stats
              WHERE n_days >= 6 AND med >= {K} AND devices / med >= 2.5 AND devices >= 50
            ),
            events AS (
              SELECT by_, bx_, d,
                     min(hh) AS first_hour, max(hh) AS last_hour,
                     count(DISTINCT hh) AS burst_hours,
                     count(DISTINCT gh6) AS cells,
                     max(devices) AS peak_devices,
                     round(max(devices / med), 1) AS peak_uplift,
                     round(avg(lat), 4) AS lat, round(avg(lng), 4) AS lng
              FROM bursts
              GROUP BY 1, 2, 3
              HAVING count(DISTINCT hh) >= 2 OR max(devices) >= 200
            ),
            labelled AS (
              SELECT e.*, min_by(z.zone, hav_m(e.lat, e.lng, z.zlat, z.zlng)) AS zone
              FROM events e CROSS JOIN zones z GROUP BY ALL
            ),
            -- devices stopping inside each event's footprint during its window
            event_devices AS (
              SELECT l.d, l.by_, l.bx_, s.device_id,
                     min(s.start_ts) AS first_stop_in_event
              FROM labelled l
              JOIN stops s
                ON s.start_ts BETWEEN l.first_hour AND l.last_hour + INTERVAL 1 HOUR
               AND hav_m(s.lat, s.lng, l.lat, l.lng) <= 1500
              GROUP BY 1, 2, 3, 4
            ),
            prior_visitors AS (
              SELECT DISTINCT l.d, l.by_, l.bx_, s2.device_id
              FROM labelled l
              JOIN stops s2
                ON s2.d < l.d AND hav_m(s2.lat, s2.lng, l.lat, l.lng) <= 1500
            ),
            newcomers AS (
              SELECT ed.d, ed.by_, ed.bx_,
                     count(*) AS event_stop_devices,
                     count(*) FILTER (p.device_id IS NULL) AS first_time_devices
              FROM event_devices ed
              LEFT JOIN prior_visitors p USING (d, by_, bx_, device_id)
              GROUP BY 1, 2, 3
            )
            SELECT l.zone, l.d, l.first_hour, l.last_hour, l.burst_hours, l.cells,
                   l.peak_devices, l.peak_uplift, l.lat, l.lng,
                   n.event_stop_devices,
                   round(n.first_time_devices / nullif(n.event_stop_devices, 0)::DOUBLE, 2)
                     AS first_time_share
            FROM labelled l
            LEFT JOIN newcomers n USING (d, by_, bx_)
            ORDER BY l.peak_uplift DESC LIMIT 15"""),
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


# ---------------------------------------------------------------- venue affinity

def _visitor_view(con) -> None:
    con.execute("""
        CREATE OR REPLACE TEMP TABLE dh_aff AS
        SELECT device_id, median(lat) AS hlat, median(lng) AS hlng
        FROM stops
        WHERE (start_hour >= 21 OR start_hour <= 5) AND dwell_min >= 30
        GROUP BY 1 HAVING count(*) >= 3""")
    con.execute("""
        CREATE OR REPLACE TEMP VIEW vv_aff AS
        SELECT v.* FROM visits v JOIN dh_aff h USING (device_id)
        WHERE hav_m(v.lat, v.lng, h.hlat, h.hlng) >= 400""")


def run_affinity(con) -> dict:
    _visitor_view(con)
    return {
        # category-pair lift: P(A and B on same device-day) / (P(A) * P(B))
        "category_lift": rows(con, f"""
            WITH dd AS (
              SELECT DISTINCT device_id, d, poi_group FROM vv_aff
              WHERE poi_group NOT IN ('Other', 'Geographic')
            ),
            n_days AS (SELECT count(DISTINCT (device_id, d)) AS n FROM dd),
            singles AS (
              SELECT poi_group, count(*) AS days FROM dd GROUP BY 1
            ),
            pairs AS (
              SELECT a.poi_group AS ga, b.poi_group AS gb, count(*) AS both_days
              FROM dd a JOIN dd b USING (device_id, d)
              WHERE a.poi_group < b.poi_group
              GROUP BY 1, 2 HAVING count(*) >= {K * 10}
            )
            SELECT p.ga, p.gb, p.both_days,
                   round(p.both_days * n.n / (sa.days * sb.days::DOUBLE), 2) AS lift
            FROM pairs p, n_days n
            JOIN singles sa ON sa.poi_group = p.ga
            JOIN singles sb ON sb.poi_group = p.gb
            ORDER BY lift DESC LIMIT 25"""),
        "brand_lift": rows(con, f"""
            WITH topb AS (
              SELECT poi_name FROM vv_aff
              GROUP BY 1 HAVING count(DISTINCT poi_id) >= 5
              ORDER BY count(DISTINCT device_id) DESC LIMIT 20
            ),
            dd AS (
              SELECT DISTINCT v.device_id, v.d, v.poi_name
              FROM vv_aff v JOIN topb USING (poi_name)
            ),
            n_days AS (SELECT count(DISTINCT (device_id, d)) AS n FROM dd),
            singles AS (SELECT poi_name, count(*) AS days FROM dd GROUP BY 1),
            pairs AS (
              SELECT a.poi_name AS ba, b.poi_name AS bb, count(*) AS both_days
              FROM dd a JOIN dd b USING (device_id, d)
              WHERE a.poi_name < b.poi_name
              GROUP BY 1, 2 HAVING count(*) >= {K}
            )
            SELECT p.ba, p.bb, p.both_days,
                   round(p.both_days * n.n / (sa.days * sb.days::DOUBLE), 2) AS lift
            FROM pairs p, n_days n
            JOIN singles sa ON sa.poi_name = p.ba
            JOIN singles sb ON sb.poi_name = p.bb
            ORDER BY lift DESC LIMIT 20"""),
        # do Singapore's biggest malls share or split their visitors?
        # A mall's footfall is split across its interior POIs by nearest-POI
        # attribution, so the mall is defined spatially: any visitor visit
        # within 150 m of the mall's Overture point.
        "mall_overlap": rows(con, f"""
            WITH mall_pois AS (
              SELECT name, avg(lat) AS lat, avg(lng) AS lng
              FROM pois
              WHERE category IN ('shopping_center', 'department_store')
                AND confidence >= 0.6
              GROUP BY 1
            ),
            mv AS (
              SELECT DISTINCT m.name, v.device_id
              FROM vv_aff v JOIN mall_pois m
                ON abs(v.lat - m.lat) < 0.0015 AND abs(v.lng - m.lng) < 0.0015
               AND hav_m(v.lat, v.lng, m.lat, m.lng) <= 150
            ),
            top_malls AS (
              SELECT name, count(*) AS devices FROM mv
              GROUP BY 1 ORDER BY devices DESC LIMIT 12
            )
            SELECT a.name AS mall_a, b.name AS mall_b,
                   count(*) AS shared_devices,
                   ta.devices AS a_devices, tb.devices AS b_devices,
                   round(count(*) / least(ta.devices, tb.devices)::DOUBLE, 3) AS overlap_share
            FROM mv a
            JOIN mv b USING (device_id)
            JOIN top_malls ta ON ta.name = a.name
            JOIN top_malls tb ON tb.name = b.name
            JOIN mall_pois pa ON pa.name = a.name
            JOIN mall_pois pb ON pb.name = b.name
            WHERE a.name < b.name
              -- different complexes only: duplicate/interior POIs of the same
              -- mall sit within a few hundred metres of each other
              AND hav_m(pa.lat, pa.lng, pb.lat, pb.lng) > 500
            GROUP BY 1, 2, ta.devices, tb.devices
            HAVING count(*) >= {K}
            ORDER BY overlap_share DESC LIMIT 15"""),
    }


# ---------------------------------------------------------------- data.gov.sg context

CBD_PAS = "('DOWNTOWN CORE','SINGAPORE RIVER','ORCHARD','MUSEUM','ROCHOR','OUTRAM','NEWTON','RIVER VALLEY')"


def run_urban_context(con) -> dict:
    con.execute("""
        CREATE OR REPLACE TEMP TABLE device_home2 AS
        SELECT device_id, median(lat) AS hlat, median(lng) AS hlng, mode(pa) AS home_pa
        FROM stops
        WHERE (start_hour >= 21 OR start_hour <= 5) AND dwell_min >= 30
        GROUP BY 1 HAVING count(*) >= 3""")
    return {
        "holiday_effect": {
            "calendar": rows(con, """
                SELECT s.d, dayname(s.d) AS day, h.holiday,
                       count(DISTINCT s.device_id) AS stop_devices,
                       count(*) AS stops,
                       round(count(*) FILTER (s.pa IN """ + CBD_PAS + """)
                             / count(*)::DOUBLE, 3) AS cbd_stop_share
                FROM stops s LEFT JOIN holidays h ON h.d = s.d
                GROUP BY 1, 2, 3 ORDER BY 1"""),
            "jun1_vs_midweek": one(con, """
                WITH per_day AS (
                  SELECT d, count(*) AS trips FROM trips GROUP BY 1
                )
                SELECT
                  (SELECT trips FROM per_day WHERE d = DATE '2026-06-01') AS jun1_trips,
                  round((SELECT avg(trips) FROM per_day
                         WHERE d BETWEEN DATE '2026-06-02' AND DATE '2026-06-05'), 0) AS midweek_avg_trips"""),
        },
        "penetration": rows(con, f"""
            SELECT p.pa, pop.residents,
                   count(*) AS home_devices,
                   round(count(*) / pop.residents::DOUBLE, 4) AS penetration
            FROM device_home2 h
            JOIN planning_areas p ON h.home_pa = p.pa
            JOIN pa_population pop ON pop.pa = p.pa
            GROUP BY 1, 2
            HAVING count(*) >= {K}
            ORDER BY penetration DESC"""),
        "rain_response": {
            "hourly_join": rows(con, """
                WITH act AS (
                  SELECT date_trunc('hour', ts) AS hh, count(DISTINCT device_id) AS devices
                  FROM pings WHERE source_type IN ('sdk','app') GROUP BY 1
                )
                SELECT r.mm >= 0.5 AS wet, hour(a.hh) AS h,
                       round(avg(a.devices), 0) AS avg_devices, count(*) AS n_hours
                FROM act a JOIN rainfall r ON r.hh = a.hh
                WHERE hour(a.hh) BETWEEN 7 AND 22
                GROUP BY 1, 2 ORDER BY 2, 1"""),
            "outdoor_vs_indoor": rows(con, """
                SELECT r.mm >= 0.5 AS wet,
                       count(*) FILTER (v.poi_group = 'Sports & Recreation') AS outdoor_visits,
                       count(*) FILTER (v.poi_group IN ('Shopping', 'Food & Drink')) AS indoor_visits,
                       count(*) AS all_visits,
                       count(DISTINCT date_trunc('hour', v.start_ts)) AS n_hours
                FROM visits v
                JOIN rainfall r ON r.hh = date_trunc('hour', v.start_ts)
                WHERE hour(v.start_ts) BETWEEN 7 AND 22
                GROUP BY 1"""),
        },
        "commute_validation": rows(con, """
            WITH census AS (
              SELECT workplace_pa, workers,
                     round((m0_15*7.5 + m16_30*23 + m31_45*38 + m46_60*53 + m60p*75)
                           / workers, 0) AS census_est_mean_min
              FROM travel_time ORDER BY workers DESC LIMIT 12
            ),
            observed AS (
              SELECT s.pa AS workplace_pa,
                     round(median(t.travel_min), 0) AS observed_med_min,
                     count(*) AS obs_trips
              FROM trips t
              JOIN stops s ON s.device_id = t.device_id AND s.start_ts = t.arrive_ts
              WHERE t.depart_hour BETWEEN 6 AND 9 AND t.dow BETWEEN 1 AND 5
                AND s.dwell_min >= 120
              GROUP BY 1
            )
            SELECT c.workplace_pa, c.workers AS census_workers,
                   c.census_est_mean_min, o.observed_med_min, o.obs_trips
            FROM census c LEFT JOIN observed o USING (workplace_pa)
            ORDER BY c.workers DESC"""),
        "hawker_footfall": rows(con, f"""
            SELECT h.name, any_value(h.stalls) AS stalls,
                   count(DISTINCT s.device_id) AS visitor_devices,
                   round(median(s.dwell_min), 1) AS med_dwell_min
            FROM stops s
            JOIN hawkers h
              ON abs(s.lat - h.lat) < 0.0013 AND abs(s.lng - h.lng) < 0.0013
             AND hav_m(s.lat, s.lng, h.lat, h.lng) <= 120
            JOIN device_home2 dh ON dh.device_id = s.device_id
            WHERE s.dwell_min <= 240
              AND hav_m(s.lat, s.lng, dh.hlat, dh.hlng) >= 400
            GROUP BY h.name
            HAVING count(DISTINCT s.device_id) >= {K}
            ORDER BY visitor_devices DESC LIMIT 20"""),
            "mrt_station_footfall": rows(con, f"""
            WITH near AS (
              SELECT s.device_id, s.dwell_min, e.station,
                     hav_m(s.lat, s.lng, dh.hlat, dh.hlng) AS home_dist
              FROM stops s
              JOIN mrt_exits e
                ON abs(s.lat - e.lat) < 0.0016 AND abs(s.lng - e.lng) < 0.0016
               AND hav_m(s.lat, s.lng, e.lat, e.lng) <= 150
              JOIN device_home2 dh ON dh.device_id = s.device_id
              WHERE s.dwell_min <= 240
                AND hav_m(s.lat, s.lng, dh.hlat, dh.hlng) >= 400
            )
            SELECT station, count(DISTINCT device_id) AS devices,
                   round(median(dwell_min), 1) AS med_dwell_min,
                   round(median(home_dist) / 1000.0, 1) AS med_home_dist_km
            FROM near GROUP BY 1
            HAVING count(DISTINCT device_id) >= {K}
            ORDER BY devices DESC LIMIT 20"""),
        "ses_validation": _ses_validation(con),
    }


def _ses_validation(con) -> dict:
    """Ecological SES vs census income by home PA (corr computed in Python)."""
    try:
        con.execute("SELECT 1 FROM device_ses LIMIT 1")
        con.execute("SELECT 1 FROM hh_income LIMIT 1")
    except Exception:
        return {"status": "skipped", "reason": "device_ses or hh_income missing"}

    pa_rows = rows(con, f"""
        WITH observed AS (
          SELECT s.home_pa AS pa,
                 count(*) AS devices,
                 round(avg(s.ses_score), 3) AS mean_ses,
                 round(median(s.ses_score), 3) AS med_ses,
                 round(avg(coalesce(w.weight, 1) * s.ses_score)
                       / nullif(avg(coalesce(w.weight, 1)), 0), 3) AS weighted_mean_ses,
                 round(count(*) FILTER (s.ses_quintile >= 4)
                       / count(*)::DOUBLE, 3) AS share_q4q5
          FROM device_ses s
          LEFT JOIN device_weights w USING (device_id)
          GROUP BY 1 HAVING count(*) >= {K}
        )
        SELECT o.*, i.census_est_mean_income, i.share_ge_10k, i.share_ge_15k, i.households
        FROM observed o
        JOIN hh_income i USING (pa)
        ORDER BY i.census_est_mean_income DESC""")

    if len(pa_rows) < 5:
        return {"status": "insufficient_pas", "n": len(pa_rows), "by_pa": pa_rows}

    import math

    def _rank(xs: list[float]) -> list[float]:
        order = sorted(range(len(xs)), key=lambda i: xs[i])
        ranks = [0.0] * len(xs)
        for r, i in enumerate(order, start=1):
            ranks[i] = float(r)
        return ranks

    def _pearson(xs: list[float], ys: list[float]) -> float | None:
        n = len(xs)
        if n < 3:
            return None
        mx = sum(xs) / n
        my = sum(ys) / n
        num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
        dy = math.sqrt(sum((y - my) ** 2 for y in ys))
        if dx == 0 or dy == 0:
            return None
        return round(num / (dx * dy), 3)

    ses = [float(r["mean_ses"]) for r in pa_rows]
    inc = [float(r["census_est_mean_income"]) for r in pa_rows]
    pearson = _pearson(ses, inc)
    spearman = _pearson(_rank(ses), _rank(inc))
    return {
        "status": "ok",
        "n_pas": len(pa_rows),
        "pearson_mean_ses_vs_census_income": pearson,
        "spearman_mean_ses_vs_census_income": spearman,
        "pass_criterion": bool(spearman is not None and spearman > 0.3),
        "by_pa": pa_rows,
    }


# ---------------------------------------------------------------- device segments

def run_segments(con) -> dict:
    return {
        "sizes": rows(con, """
            SELECT segment, count(*) AS devices,
                   round(count(*) / (SELECT count(*) FROM device_segments)::DOUBLE, 3) AS share
            FROM device_segments GROUP BY 1 ORDER BY devices DESC"""),
        "profiles": rows(con, f"""
            SELECT s.segment,
                   count(*) AS devices,
                   round(median(f.active_days), 1) AS med_active_days,
                   round(median(f.rog_km), 2) AS med_rog_km,
                   round(median(f.commute_km), 1) AS med_commute_km,
                   round(avg(f.night_stop_share), 3) AS avg_night_share,
                   round(avg(f.weekend_stop_share), 3) AS avg_weekend_share,
                   round(median(f.trips), 1) AS med_trips,
                   round(avg(f.visits), 1) AS avg_visits,
                   round(count(*) FILTER (f.id_type = 'idfa') / count(*)::DOUBLE, 2) AS ios_share
            FROM device_segments s JOIN device_features f USING (device_id)
            GROUP BY 1 HAVING count(*) >= {K}
            ORDER BY devices DESC"""),
        "tags": _segment_tags(con),
        "occupation_mix": _safe_rows(con, f"""
            SELECT occupation_class, count(*) AS devices
            FROM device_segments
            WHERE occupation_class IS NOT NULL
            GROUP BY 1 HAVING count(*) >= {K}
            ORDER BY devices DESC"""),
        "segment_hourly": rows(con, """
            SELECT g.segment, st.start_hour AS h, count(*) AS stop_starts
            FROM stops st
            JOIN device_segments g USING (device_id)
            WHERE g.segment IN ('cbd_commuter', 'night_shift', 'likely_tourist',
                                'homebody', 'cross_border')
              AND st.dow BETWEEN 1 AND 5
            GROUP BY 1, 2 ORDER BY 1, 2"""),
        "segment_home_pas": rows(con, f"""
            WITH ranked AS (
              SELECT segment, home_pa, count(*) AS devices,
                     row_number() OVER (PARTITION BY segment ORDER BY count(*) DESC) AS rk
              FROM device_segments
              WHERE home_pa IS NOT NULL
              GROUP BY 1, 2 HAVING count(*) >= {K}
            )
            SELECT segment, home_pa, devices FROM ranked
            WHERE rk <= 5 ORDER BY segment, devices DESC"""),
        "commuter_mode_context": rows(con, f"""
            -- area-level census mode share of each segment's home areas (ecological
            -- context: describes the areas these devices sleep in, not individuals)
            SELECT s.segment,
                   round(sum(m.public_transit * 1.0) / sum(m.workers), 2) AS home_area_transit_share,
                   round(sum(m.car * 1.0) / sum(m.workers), 2) AS home_area_car_share,
                   round(avg(f.mrt_stops), 1) AS avg_observed_mrt_stops
            FROM device_segments s
            JOIN device_features f USING (device_id)
            JOIN mode_share m ON m.pa = s.home_pa
            WHERE s.segment IN ('cbd_commuter', 'long_haul_commuter', 'town_commuter',
                                'works_near_home', 'homebody')
            GROUP BY 1 HAVING count(*) >= {K}"""),
        "tag_overlap_example": rows(con, f"""
            SELECT segment,
                   round(count(*) FILTER (tag_foodie) / count(*)::DOUBLE, 3) AS foodie,
                   round(count(*) FILTER (tag_transit_rider) / count(*)::DOUBLE, 3) AS transit_rider,
                   round(count(*) FILTER (tag_hawker_regular) / count(*)::DOUBLE, 3) AS hawker_regular,
                   round(count(*) FILTER (tag_night_owl) / count(*)::DOUBLE, 3) AS night_owl,
                   round(count(*) FILTER (tag_worked_on_vesak) / count(*)::DOUBLE, 3) AS worked_on_vesak
            FROM device_segments
            GROUP BY 1 HAVING count(*) >= {K * 20}
            ORDER BY count(*) DESC"""),
    }


# ---------------------------------------------------------------- trip purpose & tours

def run_purpose(con) -> dict:
    return {
        "purpose_by_hour": rows(con, """
            SELECT depart_hour AS h,
                   CASE WHEN dow IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
                   purpose, count(*) AS trips
            FROM trip_purpose
            WHERE purpose != 'other'
            GROUP BY 1, 2, 3 ORDER BY 2, 1"""),
        "purpose_mix": rows(con, """
            SELECT purpose, count(*) AS trips,
                   round(count(*) / (SELECT count(*) FROM trip_purpose)::DOUBLE, 3) AS trip_share,
                   round(median(dist_km), 2) AS med_dist_km,
                   round(median(travel_min), 1) AS med_travel_min
            FROM trip_purpose GROUP BY 1 ORDER BY trips DESC"""),
        "corridor_purpose": rows(con, f"""
            WITH top_corr AS (
              SELECT o_zone, d_zone FROM trips
              WHERE o_zone != d_zone
              GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 8
            )
            SELECT t.o_zone, t.d_zone, t.purpose, count(*) AS trips
            FROM trip_purpose t JOIN top_corr USING (o_zone, d_zone)
            WHERE t.purpose NOT IN ('other')
            GROUP BY 1, 2, 3 HAVING count(*) >= {K}
            ORDER BY 1, 2, trips DESC"""),
        "holiday_work_check": one(con, """
            WITH daily AS (
              SELECT d, count(*) FILTER (purpose = 'work') AS work_trips FROM trip_purpose GROUP BY 1
            )
            SELECT
              (SELECT work_trips FROM daily WHERE d = DATE '2026-06-01') AS vesak_work_trips,
              round((SELECT avg(work_trips) FROM daily
                     WHERE d BETWEEN DATE '2026-06-02' AND DATE '2026-06-05'), 0) AS midweek_avg"""),
        "tours_by_segment": rows(con, f"""
            SELECT g.segment, count(*) AS tours,
                   round(avg(t.legs), 2) AS avg_legs,
                   round(count(*) FILTER (t.tour_type = 'simple_commute')
                         / count(*)::DOUBLE, 3) AS simple_commute_share,
                   round(count(*) FILTER (t.tour_type IN ('commute_plus', 'complex'))
                         / count(*)::DOUBLE, 3) AS multi_stop_share
            FROM tours t JOIN device_segments g USING (device_id)
            WHERE g.segment != 'unanchored'
            GROUP BY 1 HAVING count(*) >= {K * 10}
            ORDER BY tours DESC"""),
        "tour_types": rows(con, """
            SELECT tour_type, count(*) AS tours, round(avg(legs), 2) AS avg_legs
            FROM tours GROUP BY 1 ORDER BY tours DESC"""),
    }


# ---------------------------------------------------------------- weighted estimates

def run_weighted(con) -> dict:
    return {
        "weighted_totals": one(con, """
            SELECT count(*) AS weighted_devices, round(sum(weight)) AS estimated_population
            FROM device_weights"""),
        "segment_shares": rows(con, f"""
            SELECT s.segment,
                   count(*) AS panel_devices,
                   round(count(*) / sum(count(*)) OVER (), 3) AS panel_share,
                   round(sum(w.weight)) AS weighted_pop,
                   round(sum(w.weight) / sum(sum(w.weight)) OVER (), 3) AS weighted_share
            FROM device_segments s JOIN device_weights w USING (device_id)
            WHERE s.segment != 'unanchored'
            GROUP BY 1 HAVING count(*) >= {K}
            ORDER BY weighted_pop DESC"""),
        "weighted_od": rows(con, f"""
            SELECT t.o_zone, t.d_zone,
                   count(*) AS panel_trips,
                   round(sum(w.weight)) AS weighted_trips
            FROM trips t JOIN device_weights w USING (device_id)
            WHERE t.o_zone != t.d_zone
            GROUP BY 1, 2 HAVING count(DISTINCT t.device_id) >= {K}
            ORDER BY weighted_trips DESC LIMIT 20"""),
        "dwelling_mix": rows(con, f"""
            SELECT s.home_dwelling,
                   count(*) AS panel_devices,
                   round(sum(w.weight)) AS weighted_pop,
                   round(sum(w.weight) / sum(sum(w.weight)) OVER (), 3) AS weighted_share
            FROM device_segments s JOIN device_weights w USING (device_id)
            GROUP BY 1 HAVING count(*) >= {K}
            ORDER BY weighted_pop DESC"""),
        # out-of-sample check: weights calibrated on Tue-Thu (Jun 2-4), applied
        # to the held-out Friday (Jun 5) — does the corrected agg shape match
        # Friday's sdk/app shape?
        "feed_correction_check": rows(con, """
            WITH cal AS (
              SELECT hour(ts) AS h,
                     count(DISTINCT device_id) FILTER (source_type = 'agg') AS agg_dev,
                     count(DISTINCT device_id) FILTER (source_type IN ('sdk','app')) AS sdk_dev
              FROM pings
              WHERE ts::DATE BETWEEN DATE '2026-06-02' AND DATE '2026-06-04'
              GROUP BY 1
            ),
            w AS (
              SELECT h, (sdk_dev / sum(sdk_dev) OVER ())
                       / (agg_dev / sum(agg_dev) OVER ()) AS weight
              FROM cal
            ),
            test AS (
              SELECT hour(ts) AS h,
                     count(DISTINCT device_id) FILTER (source_type = 'agg') AS agg_dev,
                     count(DISTINCT device_id) FILTER (source_type IN ('sdk','app')) AS sdk_dev
              FROM pings WHERE ts::DATE = DATE '2026-06-05'
              GROUP BY 1
            ),
            shares AS (
              SELECT t.h,
                     (t.agg_dev * w.weight) / sum(t.agg_dev * w.weight) OVER () AS agg_corr_share,
                     t.agg_dev / sum(t.agg_dev) OVER () AS agg_raw_share,
                     t.sdk_dev / sum(t.sdk_dev) OVER () AS sdk_share
              FROM test t JOIN w USING (h)
            )
            SELECT 'holdout_friday' AS test_day,
                   round(max(abs(agg_raw_share - sdk_share) / sdk_share), 3) AS max_dev_uncorrected,
                   round(max(abs(agg_corr_share - sdk_share) / sdk_share), 3) AS max_dev_corrected,
                   round(avg(abs(agg_raw_share - sdk_share) / sdk_share), 3) AS mean_dev_uncorrected,
                   round(avg(abs(agg_corr_share - sdk_share) / sdk_share), 3) AS mean_dev_corrected
            FROM shares"""),
    }


# ---------------------------------------------------------------- uncertainty

def _jackknife(day_values: list[float]) -> dict:
    """Day-level leave-one-out jackknife for the mean daily value."""
    import math
    n = len(day_values)
    total = sum(day_values)
    loo = [(total - v) / (n - 1) for v in day_values]
    mean_loo = sum(loo) / n
    se = math.sqrt((n - 1) / n * sum((x - mean_loo) ** 2 for x in loo))
    mean = total / n
    return {"mean_per_day": round(mean, 1), "se": round(se, 1),
            "ci95_lo": round(mean - 1.96 * se, 1), "ci95_hi": round(mean + 1.96 * se, 1)}


def run_uncertainty(con) -> dict:
    # Only full days (Jun 1-7); Jun 8 is partial. Jun 1 is a holiday and is
    # deliberately kept: the CI absorbs real day-to-day variation.
    venue_days = rows(con, f"""
        WITH top AS (
          SELECT poi_id FROM visits GROUP BY 1
          ORDER BY count(DISTINCT device_id) DESC LIMIT 10
        )
        SELECT any_value(v.poi_name) AS name, v.d, count(DISTINCT v.device_id) AS devices
        FROM visits v JOIN top USING (poi_id)
        WHERE v.d BETWEEN DATE '2026-06-01' AND DATE '2026-06-07'
        GROUP BY v.poi_id, v.d""")
    corridor_days = rows(con, f"""
        WITH top AS (
          SELECT o_zone, d_zone FROM trips WHERE o_zone != d_zone
          GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 8
        )
        SELECT t.o_zone || ' → ' || t.d_zone AS corridor, t.d, count(*) AS trips
        FROM trips t JOIN top USING (o_zone, d_zone)
        WHERE t.d BETWEEN DATE '2026-06-01' AND DATE '2026-06-07'
        GROUP BY 1, 2""")

    def collect(recs, key, val):
        out: dict[str, list[float]] = {}
        for r in recs:
            out.setdefault(r[key], []).append(float(r[val]))
        return {k: _jackknife(v) for k, v in out.items() if len(v) == 7}

    return {
        "method": "day-level leave-one-out jackknife over the 7 full days; "
                  "95% CI on the mean daily value",
        "venue_daily_footfall": [
            {"name": k, **v} for k, v in sorted(
                collect(venue_days, "name", "devices").items(),
                key=lambda kv: -kv[1]["mean_per_day"])],
        "corridor_daily_trips": [
            {"corridor": k, **v} for k, v in sorted(
                collect(corridor_days, "corridor", "trips").items(),
                key=lambda kv: -kv[1]["mean_per_day"])],
    }


# ---------------------------------------------------------------- SES / household / occupation exports

def run_ses(con) -> dict:
    try:
        con.execute("SELECT 1 FROM device_ses LIMIT 1")
    except Exception:
        return {"status": "skipped", "reason": "device_ses missing — run build --steps ses"}

    return {
        "quintile_sizes": rows(con, f"""
            SELECT ses_quintile, count(*) AS devices,
                   round(avg(ses_score), 3) AS mean_score,
                   round(median(home_value), 0) AS med_home_value,
                   round(avg(is_ios), 3) AS ios_share,
                   round(avg(mean_tier), 2) AS mean_brand_tier
            FROM device_ses
            GROUP BY 1 HAVING count(*) >= {K}
            ORDER BY 1"""),
        "dwelling_by_quintile": rows(con, f"""
            SELECT ses_quintile, dwelling, count(*) AS devices
            FROM device_ses
            GROUP BY 1, 2 HAVING count(*) >= {K}
            ORDER BY 1, devices DESC"""),
        "pa_ses_mix": rows(con, f"""
            SELECT home_pa,
                   count(*) AS devices,
                   round(avg(ses_score), 3) AS mean_ses,
                   round(median(ses_quintile), 1) AS med_quintile,
                   round(count(*) FILTER (ses_quintile >= 4) / count(*)::DOUBLE, 3) AS share_q4q5
            FROM device_ses
            GROUP BY 1 HAVING count(*) >= {K}
            ORDER BY mean_ses DESC"""),
        "segment_x_ses": rows(con, f"""
            SELECT g.segment, s.ses_quintile, count(*) AS devices
            FROM device_ses s
            JOIN device_segments g USING (device_id)
            GROUP BY 1, 2 HAVING count(*) >= {K}
            ORDER BY 1, 2"""),
        "validation": _ses_validation(con),
    }


def run_household(con) -> dict:
    """Distributions only — never export device pairs."""
    try:
        con.execute("SELECT 1 FROM home_cell_occupancy LIMIT 1")
    except Exception:
        return {"status": "skipped", "reason": "household tables missing"}

    out = {
        "privacy": "distributions_only_no_pairs",
        "min_k": K,
        "household_size_distribution": rows(con, f"""
            SELECT household_size_band, n_home_cells, n_devices, n_with_work
            FROM household_cohorts
            WHERE n_home_cells >= {K}
            ORDER BY household_size_band"""),
        "single_vs_multi": one(con, f"""
            SELECT
              count(*) FILTER (n_devices = 1) AS single_device_homes,
              count(*) FILTER (n_devices >= 2) AS multi_device_homes,
              round(count(*) FILTER (n_devices >= 2)
                    / nullif(count(*), 0)::DOUBLE, 3) AS multi_share
            FROM home_cell_occupancy
            WHERE n_devices >= 1"""),
        "dual_income_proxy": one(con, """
            SELECT
              count(*) FILTER (n_devices >= 2 AND n_with_work >= 2) AS dual_work_homes,
              count(*) FILTER (n_devices >= 2) AS multi_homes,
              round(count(*) FILTER (n_devices >= 2 AND n_with_work >= 2)
                    / nullif(count(*) FILTER (n_devices >= 2), 0)::DOUBLE, 3)
                AS dual_income_share_among_multi
            FROM home_cell_occupancy"""),
    }
    try:
        out["weekend_comove_rate"] = one(con, f"""
            SELECT count(*) AS likely_household_pairs,
                   count(*) FILTER (co_weekend_days >= 1) AS weekend_comove_pairs,
                   round(count(*) FILTER (co_weekend_days >= 1)
                         / nullif(count(*), 0)::DOUBLE, 3) AS weekend_comove_share
            FROM household_pairs""")
        out["colleague_work_pa_dist"] = rows(con, f"""
            SELECT work_pa, count(*) AS colleague_pair_count
            FROM colleague_pairs
            GROUP BY 1 HAVING count(*) >= {K}
            ORDER BY colleague_pair_count DESC LIMIT 20""")
        out["acra_industry_mix"] = _safe_rows(con, f"""
            SELECT industry_label, count(*) AS devices
            FROM acra_work_industry
            GROUP BY 1 HAVING count(*) >= {K}
            ORDER BY devices DESC LIMIT 15""")
    except Exception as e:
        out["pair_stats_error"] = str(e)
    return out


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
    "urban_context": run_urban_context,
    "segments": run_segments,
    "affinity": run_affinity,
    "purpose": run_purpose,
    "weighted": run_weighted,
    "uncertainty": run_uncertainty,
    "ses": run_ses,
    "household": run_household,
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
