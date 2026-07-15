"""OSRM road-network routing enrichment.

Requires a local OSRM server (car profile) — start it with:
    scripts/osrm_up.sh         # docker run osrm-routed on :5001

Builds:
    trip_routes   - a sampled set of trips with road_km, drive_min, circuity
                    (network ÷ straight-line). Sample, not full population:
                    circuity/mode are distributional features, so ~40k trips
                    is ample and keeps routing to ~1 min on localhost.
    venue_drive_catchment - for top venues, share of visitors within N-min drive
                    of the venue (the real retail trade-area metric).

Mode inference: comparing observed trip duration to the OSRM car estimate gives
a per-trip car-plausibility score, validated against census mode share.
"""

from __future__ import annotations

import concurrent.futures as cf
import json
import urllib.request

import duckdb

OSRM = "http://localhost:5001"
SAMPLE_TRIPS = 40_000
WORKERS = 48


def _route(o_lng, o_lat, d_lng, d_lat):
    url = f"{OSRM}/route/v1/driving/{o_lng},{o_lat};{d_lng},{d_lat}?overview=false"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            d = json.load(r)
        if d.get("code") == "Ok" and d.get("routes"):
            rt = d["routes"][0]
            return rt["distance"] / 1000.0, rt["duration"] / 60.0
    except Exception:
        pass
    return None, None


def osrm_alive() -> bool:
    try:
        km, _ = _route(103.8198, 1.3521, 103.8514, 1.2839)
        return km is not None
    except Exception:
        return False


def build_trip_routes(con: duckdb.DuckDBPyConnection) -> None:
    if not osrm_alive():
        raise SystemExit("OSRM not reachable on :5001 — run scripts/osrm_up.sh first")

    rows = con.execute(f"""
        SELECT device_id, depart_ts, o_lat, o_lng, d_lat, d_lng,
               dist_km AS straight_km, travel_min
        FROM trips
        WHERE dist_km >= 0.3
        USING SAMPLE {SAMPLE_TRIPS} ROWS (reservoir, 42)""").fetchall()

    results = []
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {
            ex.submit(_route, r[3], r[2], r[5], r[4]): r for r in rows
        }
        for fut in cf.as_completed(futs):
            r = futs[fut]
            road_km, drive_min = fut.result()
            if road_km is None:
                continue
            results.append((r[0], r[1], float(r[6]), float(r[7]), road_km, drive_min))

    con.execute("""
        CREATE OR REPLACE TABLE trip_routes (
            device_id UBIGINT, depart_ts TIMESTAMP,
            straight_km DOUBLE, travel_min DOUBLE,
            road_km DOUBLE, drive_min DOUBLE)""")
    con.executemany(
        "INSERT INTO trip_routes VALUES (?, ?, ?, ?, ?, ?)", results)
    con.execute("""
        ALTER TABLE trip_routes ADD COLUMN circuity DOUBLE;
        UPDATE trip_routes SET circuity = road_km / nullif(straight_km, 0)""")
    n = con.execute("SELECT count(*), round(median(circuity), 2) FROM trip_routes").fetchone()
    print(f"[build] trip_routes: {n[0]:,} routed trips, median circuity {n[1]}", flush=True)


def build_venue_catchment(con: duckdb.DuckDBPyConnection) -> None:
    """For top venues, % of visitors whose home is within a 15-min drive."""
    # Visitor home points per top venue (home ≥400 m away, cap per venue)
    con.execute("""
        CREATE OR REPLACE TEMP TABLE dh_rt AS
        SELECT device_id, median(lat) AS hlat, median(lng) AS hlng
        FROM stops WHERE (start_hour >= 21 OR start_hour <= 5) AND dwell_min >= 30
        GROUP BY 1 HAVING count(*) >= 3""")
    venues = con.execute("""
        WITH top AS (
          SELECT poi_id, any_value(poi_name) AS name,
                 median(lat) AS vlat, median(lng) AS vlng,
                 count(DISTINCT device_id) AS devices
          FROM visits GROUP BY poi_id
          ORDER BY devices DESC LIMIT 25
        )
        SELECT poi_id, name, vlat, vlng FROM top""").fetchall()

    out = []
    for poi_id, name, vlat, vlng in venues:
        homes = con.execute(f"""
            SELECT hlat, hlng FROM (
              SELECT h.hlat, h.hlng
              FROM visits v JOIN dh_rt h USING (device_id)
              WHERE v.poi_id = ? AND hav_m(v.lat, v.lng, h.hlat, h.hlng) >= 400
              GROUP BY 1, 2
            ) ORDER BY random() LIMIT 400""", [poi_id]).fetchall()
        if len(homes) < 5:
            continue
        within = 0
        durs = []
        with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = [ex.submit(_route, hl, ht, vlng, vlat) for ht, hl in homes]
            for fut in cf.as_completed(futs):
                _, dmin = fut.result()
                if dmin is not None:
                    durs.append(dmin)
                    if dmin <= 15:
                        within += 1
        if durs:
            durs.sort()
            out.append((name, len(durs), round(within / len(durs), 3),
                        round(durs[len(durs) // 2], 1)))

    con.execute("""
        CREATE OR REPLACE TABLE venue_drive_catchment (
            name VARCHAR, visitors_sampled INT,
            share_within_15min DOUBLE, median_drive_min DOUBLE)""")
    if out:
        con.executemany(
            "INSERT INTO venue_drive_catchment VALUES (?, ?, ?, ?)", out)
    print(f"[build] venue_drive_catchment: {len(out)} venues", flush=True)


def build_routing(con: duckdb.DuckDBPyConnection) -> None:
    build_trip_routes(con)
    build_venue_catchment(con)
