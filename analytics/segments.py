"""Device segmentation: behavioural features -> rule-based segments + tags.

Only trajectory-grade devices (>=20 pings across >=3 hours) are segmentable;
features draw on stops (with planning areas), trips, POI visits, and the
data.gov.sg civic layers. Rules are transparent CASE logic, not a black box,
so every segment is explainable and auditable.

Privacy: device_ids are already one-way hashes; segments live only inside the
warehouse and are exported exclusively as k-anonymous aggregates. Census
attributes are joined at planning-area level (ecological context, not
individual claims).

Tables:
    device_features - one row per trajectory device
    device_segments - primary segment + boolean lifestyle tags
"""

from __future__ import annotations

import duckdb

CBD_PAS = "('DOWNTOWN CORE','SINGAPORE RIVER','ORCHARD','MUSEUM','ROCHOR','OUTRAM','NEWTON','RIVER VALLEY')"
HOTEL_PAS = "('DOWNTOWN CORE','ORCHARD','SINGAPORE RIVER','MUSEUM','MARINA SOUTH','ROCHOR')"


def build_device_features(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(f"""
        CREATE OR REPLACE TABLE device_features AS
        WITH home AS (
          SELECT device_id, median(lat) AS hlat, median(lng) AS hlng,
                 mode(pa) AS home_pa, count(DISTINCT d) AS nights
          FROM stops
          WHERE (start_hour >= 21 OR start_hour <= 5) AND dwell_min >= 30
          GROUP BY 1 HAVING count(*) >= 3
        ),
        work AS (
          SELECT device_id, median(lat) AS wlat, median(lng) AS wlng,
                 mode(pa) AS work_pa, count(DISTINCT d) AS work_days
          FROM stops
          WHERE start_hour BETWEEN 9 AND 17 AND dow BETWEEN 1 AND 5 AND dwell_min >= 60
          GROUP BY 1 HAVING count(DISTINCT d) >= 3
        ),
        night_work AS (
          SELECT device_id, median(lat) AS nwlat, median(lng) AS nwlng,
                 count(DISTINCT d) AS night_work_days
          FROM stops
          WHERE (start_hour >= 22 OR start_hour <= 4) AND dwell_min >= 120
          GROUP BY 1 HAVING count(DISTINCT d) >= 3
        ),
        stop_centroid AS (
          SELECT device_id, avg(lat) AS clat, avg(lng) AS clng FROM stops GROUP BY 1
        ),
        stop_stats AS (
          SELECT s.device_id,
                 count(*) AS stops,
                 count(DISTINCT s.d) AS stop_days,
                 sqrt(avg(pow(hav_m(s.lat, s.lng, c.clat, c.clng), 2))) / 1000.0 AS rog_km,
                 count(*) FILTER (s.start_hour >= 22 OR s.start_hour <= 4)::DOUBLE / count(*) AS night_stop_share,
                 count(*) FILTER (s.dow IN (0, 6))::DOUBLE / count(*) AS weekend_stop_share,
                 count(DISTINCT s.d) FILTER (s.pa IN {HOTEL_PAS}
                   AND (s.start_hour >= 22 OR s.start_hour <= 4)) AS hotel_area_nights
          FROM stops s JOIN stop_centroid c USING (device_id)
          GROUP BY s.device_id
        ),
        trip_stats AS (
          SELECT device_id, count(*) AS trips, median(dist_km) AS med_trip_km
          FROM trips GROUP BY 1
        ),
        visit_mix AS (
          SELECT device_id, count(*) AS visits,
                 count(*) FILTER (poi_group = 'Food & Drink') AS v_food,
                 count(*) FILTER (poi_group = 'Shopping') AS v_shop,
                 count(*) FILTER (poi_group = 'Sports & Recreation') AS v_sport,
                 count(*) FILTER (poi_group = 'Arts & Entertainment') AS v_ent,
                 count(*) FILTER (poi_group = 'Education') AS v_edu,
                 count(*) FILTER (hour(start_ts) >= 21
                   AND poi_group IN ('Food & Drink', 'Arts & Entertainment')) AS v_late
          FROM visits GROUP BY 1
        ),
        mrt AS (
          SELECT s.device_id, count(*) AS mrt_stops
          FROM stops s JOIN mrt_exits e
            ON abs(s.lat - e.lat) < 0.0016 AND abs(s.lng - e.lng) < 0.0016
           AND hav_m(s.lat, s.lng, e.lat, e.lng) <= 150
          WHERE s.dwell_min <= 120
          GROUP BY 1
        ),
        hawker AS (
          SELECT s.device_id, count(*) AS hawker_stops
          FROM stops s JOIN hawkers h
            ON abs(s.lat - h.lat) < 0.0013 AND abs(s.lng - h.lng) < 0.0013
           AND hav_m(s.lat, s.lng, h.lat, h.lng) <= 120
          WHERE s.dwell_min <= 240
          GROUP BY 1
        ),
        special AS (
          SELECT s.device_id,
                 count(DISTINCT s.d) FILTER (z.zone = 'Changi Airport') AS airport_days,
                 count(DISTINCT s.d) FILTER (z.zone LIKE '%Checkpoint') AS checkpoint_days
          FROM stops s JOIN zones z
            ON z.zone IN ('Changi Airport', 'Woodlands Checkpoint', 'Tuas Checkpoint')
           AND hav_m(s.lat, s.lng, z.zlat, z.zlng) < 1200
          GROUP BY 1
        ),
        vesak AS (
          SELECT device_id, count(*) > 0 AS worked_holiday
          FROM stops s JOIN work w USING (device_id)
          WHERE s.d = DATE '2026-06-01' AND s.start_hour BETWEEN 9 AND 17
            AND s.dwell_min >= 120 AND hav_m(s.lat, s.lng, w.wlat, w.wlng) <= 500
          GROUP BY 1
        )
        SELECT
          d.device_id, d.pings, d.active_days, d.id_type,
          ss.stops, ss.stop_days, ss.rog_km, ss.night_stop_share,
          ss.weekend_stop_share, ss.hotel_area_nights,
          h.home_pa, h.nights, h.hlat, h.hlng,
          CASE WHEN w.device_id IS NOT NULL
                AND (h.device_id IS NULL OR hav_m(w.wlat, w.wlng, h.hlat, h.hlng) > 500)
               THEN w.work_pa END AS work_pa,
          w.work_days,
          CASE WHEN w.device_id IS NOT NULL AND h.device_id IS NOT NULL
               THEN hav_m(w.wlat, w.wlng, h.hlat, h.hlng) / 1000.0 END AS commute_km,
          CASE WHEN nw.device_id IS NOT NULL
                AND (h.device_id IS NULL OR hav_m(nw.nwlat, nw.nwlng, h.hlat, h.hlng) > 500)
               THEN nw.night_work_days ELSE 0 END AS night_work_days,
          coalesce(t.trips, 0) AS trips, t.med_trip_km,
          coalesce(v.visits, 0) AS visits,
          coalesce(v.v_food, 0) AS v_food, coalesce(v.v_shop, 0) AS v_shop,
          coalesce(v.v_sport, 0) AS v_sport, coalesce(v.v_ent, 0) AS v_ent,
          coalesce(v.v_edu, 0) AS v_edu, coalesce(v.v_late, 0) AS v_late,
          coalesce(m.mrt_stops, 0) AS mrt_stops,
          coalesce(hk.hawker_stops, 0) AS hawker_stops,
          coalesce(sp.airport_days, 0) AS airport_days,
          coalesce(sp.checkpoint_days, 0) AS checkpoint_days,
          coalesce(vk.worked_holiday, false) AS worked_holiday
        FROM devices d
        JOIN stop_stats ss USING (device_id)
        LEFT JOIN home h USING (device_id)
        LEFT JOIN work w USING (device_id)
        LEFT JOIN night_work nw USING (device_id)
        LEFT JOIN trip_stats t USING (device_id)
        LEFT JOIN visit_mix v USING (device_id)
        LEFT JOIN mrt m USING (device_id)
        LEFT JOIN hawker hk USING (device_id)
        LEFT JOIN special sp USING (device_id)
        LEFT JOIN vesak vk USING (device_id)
        WHERE d.traj_ok
        """)


def build_device_segments(con: duckdb.DuckDBPyConnection) -> None:
    has_dwelling = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = 'home_dwelling'"
    ).fetchone()[0] > 0
    dwelling_select = (
        "coalesce(hd.dwelling, 'unknown') AS home_dwelling,"
        if has_dwelling else "'unknown' AS home_dwelling,"
    )
    dwelling_join = (
        "LEFT JOIN home_dwelling hd ON round(f.hlat, 4) = hd.hlat AND round(f.hlng, 4) = hd.hlng"
        if has_dwelling else ""
    )
    con.execute(f"""
        CREATE OR REPLACE TABLE device_segments AS
        SELECT
          f.device_id, f.home_pa, f.work_pa, f.id_type,
          {dwelling_select}
          pa.young_share AS home_area_young_share,
          pa.senior_share AS home_area_senior_share,
          -- primary segment: first matching rule wins
          CASE
            WHEN checkpoint_days >= 2 THEN 'cross_border'
            WHEN home_pa IS NULL AND airport_days >= 1
                 AND hotel_area_nights >= 1 THEN 'likely_tourist'
            WHEN home_pa IS NULL AND hotel_area_nights >= 2 THEN 'likely_tourist'
            WHEN night_work_days >= 3 AND work_pa IS NULL THEN 'night_shift'
            WHEN work_pa IN {CBD_PAS} AND home_pa IS NOT NULL
                 AND home_pa != work_pa THEN 'cbd_commuter'
            WHEN commute_km >= 12 THEN 'long_haul_commuter'
            WHEN work_pa IS NOT NULL AND home_pa = work_pa THEN 'works_near_home'
            WHEN work_pa IS NOT NULL THEN 'town_commuter'
            WHEN v_edu >= 3 AND home_pa IS NOT NULL THEN 'school_linked'
            WHEN home_pa IS NOT NULL AND rog_km < 2 THEN 'homebody'
            WHEN home_pa IS NOT NULL AND rog_km >= 8 THEN 'islandwide_rover'
            WHEN home_pa IS NOT NULL THEN 'local_resident'
            ELSE 'unanchored'
          END AS segment,
          -- lifestyle tags: non-exclusive
          (v_food >= 5 AND v_food >= 0.3 * greatest(visits, 1)) AS tag_foodie,
          (v_shop >= 5 AND v_shop >= 0.2 * greatest(visits, 1)) AS tag_shopper,
          (v_sport >= 4 AND v_sport >= 0.15 * greatest(visits, 1)) AS tag_active_lifestyle,
          (v_late >= 4) AS tag_night_owl,
          (mrt_stops >= 3) AS tag_transit_rider,
          (hawker_stops >= 3) AS tag_hawker_regular,
          (airport_days >= 1) AS tag_airport_contact,
          worked_holiday AS tag_worked_on_vesak
        FROM device_features f
        {dwelling_join}
        LEFT JOIN pa_age pa ON pa.pa = f.home_pa
        """)


def build_segments(con: duckdb.DuckDBPyConnection) -> None:
    build_device_features(con)
    n = con.execute("SELECT count(*) FROM device_features").fetchone()[0]
    print(f"[build] device_features: {n:,} rows", flush=True)
    try:
        from .datagov import build_dwellings
        build_dwellings(con)
    except Exception as e:
        print(f"[build] home_dwelling skipped: {e}", flush=True)
    build_device_segments(con)
    n = con.execute("SELECT count(*) FROM device_segments").fetchone()[0]
    print(f"[build] device_segments: {n:,} rows", flush=True)
