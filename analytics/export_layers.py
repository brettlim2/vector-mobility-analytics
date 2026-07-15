"""Export map layers + filter cubes for the analytics UI.

Writes k≥5-suppressed aggregates into EXPORT_DIR (default: public/data/).
No per-device trajectories leave the warehouse.
"""

from __future__ import annotations

import csv
import json
import shutil
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import h3

from . import EXPORT_DIR, MIN_K_ANON, OUT_DIR
from .engine import connect
from .zones import SG_ZONES

K = MIN_K_ANON

DAYPART_SQL = """
CASE
  WHEN hour(ts) BETWEEN 7 AND 9   THEN 'morning'
  WHEN hour(ts) BETWEEN 10 AND 16 THEN 'midday'
  WHEN hour(ts) BETWEEN 17 AND 20 THEN 'evening'
  WHEN hour(ts) BETWEEN 21 AND 23 THEN 'night'
  ELSE 'night'
END
"""

HOUR_BAND_SQL = """
CASE
  WHEN depart_hour BETWEEN 6 AND 9 THEN 'am'
  WHEN depart_hour BETWEEN 17 AND 20 THEN 'pm'
  WHEN depart_hour >= 23 OR depart_hour <= 4 THEN 'late'
  ELSE 'offpeak'
END
"""

SOURCE_CLASS_SQL = """
CASE WHEN source_type IN ('sdk', 'app') THEN 'sdk_app' ELSE 'agg' END
"""


def _rows(con, sql: str) -> list[dict[str, Any]]:
    cur = con.sql(sql)
    cols = cur.columns
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(data, f, default=str)
    print(f"[export] wrote {path} ({path.stat().st_size:,} bytes)", flush=True)


def _parent(cell: str, res: int) -> str | None:
    if not cell:
        return None
    try:
        return h3.cell_to_parent(cell, res)
    except Exception:
        return None


def export_zones(con) -> None:
    zones = [
        {"zone": name, "lat": lat, "lng": lng, "kind": kind}
        for name, lat, lng, kind in SG_ZONES
    ]
    _write_json(EXPORT_DIR / "zones.json", {"zones": zones})


def export_kepler(con) -> None:
    out = EXPORT_DIR / "kepler"
    out.mkdir(parents=True, exist_ok=True)

    stops = _rows(con, f"""
        SELECT zone, zone_kind AS kind,
               round(avg(lat), 5) AS lat, round(avg(lng), 5) AS lng,
               count(*) AS stops, count(DISTINCT device_id) AS devices,
               round(median(dwell_min), 1) AS med_dwell_min
        FROM stops
        GROUP BY 1, 2
        HAVING count(DISTINCT device_id) >= {K}
        ORDER BY devices DESC
    """)
    with (out / "stops_agg.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["zone", "kind", "lat", "lng", "stops", "devices", "med_dwell_min"])
        w.writeheader()
        w.writerows(stops)

    visits = _rows(con, f"""
        SELECT poi_group, poi_category, zone,
               round(avg(lat), 5) AS lat, round(avg(lng), 5) AS lng,
               count(*) AS visits, count(DISTINCT device_id) AS devices,
               round(median(dwell_min), 1) AS med_dwell_min
        FROM visits
        GROUP BY 1, 2, 3
        HAVING count(DISTINCT device_id) >= {K}
        ORDER BY devices DESC
        LIMIT 5000
    """)
    with (out / "visits_agg.csv").open("w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["poi_group", "poi_category", "zone", "lat", "lng", "visits", "devices", "med_dwell_min"],
        )
        w.writeheader()
        w.writerows(visits)
    print(f"[export] kepler CSVs: {len(stops)} stop cells, {len(visits)} visit cells", flush=True)


def export_hex_density(con) -> None:
    """Unique devices by H3 res 7/8/9 × daypart (from stop centroids, k≥5)."""
    t0 = time.time()
    base = _rows(con, f"""
        SELECT h3.cell AS h3_10, daypart,
               count(DISTINCT device_id) AS devices
        FROM (
          SELECT device_id,
                 {DAYPART_SQL.replace('hour(ts)', 'start_hour')} AS daypart,
                 lat, lng
          FROM stops
        ) s,
        LATERAL (SELECT h3_latlng_to_cell(s.lat, s.lng, 10) AS cell) h3
        GROUP BY 1, 2
        HAVING count(DISTINCT device_id) >= {K}
    """)
    # Prefer Python h3 if DuckDB lacks h3; fall back gracefully.
    if not base:
        raw = _rows(con, f"""
            SELECT device_id, start_hour,
                   CASE
                     WHEN start_hour BETWEEN 7 AND 9 THEN 'morning'
                     WHEN start_hour BETWEEN 10 AND 16 THEN 'midday'
                     WHEN start_hour BETWEEN 17 AND 20 THEN 'evening'
                     ELSE 'night'
                   END AS daypart,
                   lat, lng
            FROM stops
        """)
        # Aggregate via Python h3
        buckets: dict[tuple[str, str], set] = defaultdict(set)
        for r in raw:
            try:
                cell = h3.latlng_to_cell(r["lat"], r["lng"], 10)
            except Exception:
                continue
            buckets[(cell, r["daypart"])].add(r["device_id"])
        base = [
            {"h3_10": cell, "daypart": dp, "devices": len(devs)}
            for (cell, dp), devs in buckets.items()
            if len(devs) >= K
        ]
        # Also emit summed device counts (approx unique only within cell×daypart)
        print(f"[export] hex density via Python h3: {len(base)} cells", flush=True)
    else:
        print(f"[export] hex density via DuckDB h3: {len(base)} cells", flush=True)

    by_res: dict[str, list[dict]] = {"7": [], "8": [], "9": []}
    for res in (7, 8, 9):
        rolled: dict[tuple[str, str], int] = defaultdict(int)
        for row in base:
            parent = _parent(row["h3_10"], res)
            if not parent:
                continue
            rolled[(parent, row["daypart"])] += int(row["devices"])
        # Note: summing unique-device cell counts overcounts across children;
        # for viz choropleths this is acceptable; true unique would need re-query.
        by_res[str(res)] = [
            {"h3": h, "daypart": dp, "devices": n}
            for (h, dp), n in rolled.items()
            if n >= K
        ]

    # Also include "all" daypart rollups
    for res, rows in list(by_res.items()):
        all_roll: dict[str, int] = defaultdict(int)
        for r in rows:
            all_roll[r["h3"]] += r["devices"]
        rows.extend({"h3": h, "daypart": "all", "devices": n} for h, n in all_roll.items() if n >= K)

    _write_json(EXPORT_DIR / "hex_density.json", {"resolutions": by_res, "k": K})
    print(f"[export] hex_density in {time.time() - t0:.1f}s", flush=True)


def export_hex_density_from_pings(con) -> None:
    """Faster path: aggregate pings at h3_10 × daypart in DuckDB, roll up parents."""
    t0 = time.time()
    # Use stops for speed/meaning (dwell locations). Fall back to h3_10 on pings sample path.
    base = _rows(con, f"""
        WITH tagged AS (
          SELECT device_id, h3_10,
                 CASE
                   WHEN hour(ts) BETWEEN 7 AND 9 THEN 'morning'
                   WHEN hour(ts) BETWEEN 10 AND 16 THEN 'midday'
                   WHEN hour(ts) BETWEEN 17 AND 20 THEN 'evening'
                   ELSE 'night'
                 END AS daypart
          FROM pings
          WHERE h3_10 IS NOT NULL
            AND source_type IN ('sdk', 'app')
        )
        SELECT h3_10, daypart, count(DISTINCT device_id) AS devices
        FROM tagged
        GROUP BY 1, 2
        HAVING count(DISTINCT device_id) >= {K}
    """)
    print(f"[export] hex base cells (sdk/app): {len(base):,} in {time.time() - t0:.1f}s", flush=True)

    by_res: dict[str, list[dict]] = {"7": [], "8": [], "9": []}
    for res in (7, 8, 9):
        rolled: dict[tuple[str, str], int] = defaultdict(int)
        for row in base:
            parent = _parent(row["h3_10"], res)
            if parent:
                rolled[(parent, row["daypart"])] += int(row["devices"])
        rows = [
            {"h3": h, "daypart": dp, "devices": n}
            for (h, dp), n in rolled.items()
            if n >= K
        ]
        all_roll: dict[str, int] = defaultdict(int)
        for r in rows:
            all_roll[r["h3"]] += r["devices"]
        rows.extend({"h3": h, "daypart": "all", "devices": n} for h, n in all_roll.items() if n >= K)
        by_res[str(res)] = rows

    _write_json(EXPORT_DIR / "hex_density.json", {"resolutions": by_res, "k": K, "source": "sdk_app_pings"})
    print(f"[export] hex_density done in {time.time() - t0:.1f}s", flush=True)


def export_od_arcs(con) -> None:
    zones = {z: (lat, lng) for z, lat, lng, _ in SG_ZONES}

    def enrich(rows: list[dict]) -> list[dict]:
        out = []
        for r in rows:
            o = zones.get(r["o_zone"])
            d = zones.get(r["d_zone"])
            if not o or not d:
                continue
            out.append({
                **r,
                "o_lat": o[0], "o_lng": o[1],
                "d_lat": d[0], "d_lng": d[1],
            })
        return out

    bands = {
        "all": "",
        "am": "AND depart_hour BETWEEN 6 AND 9",
        "pm": "AND depart_hour BETWEEN 17 AND 20",
        "late": "AND (depart_hour >= 23 OR depart_hour <= 4)",
    }
    payload: dict[str, list] = {}
    for band, extra in bands.items():
        rows = _rows(con, f"""
            SELECT o_zone, d_zone,
                   count(*) AS trips,
                   count(DISTINCT device_id) AS devices,
                   round(median(travel_min), 1) AS med_travel_min,
                   round(median(dist_km), 2) AS med_dist_km
            FROM trips
            WHERE o_zone != d_zone {extra}
            GROUP BY 1, 2
            HAVING count(DISTINCT device_id) >= {K}
            ORDER BY trips DESC
            LIMIT 200
        """)
        payload[band] = enrich(rows)

    _write_json(EXPORT_DIR / "od_arcs.json", {"bands": payload, "note": "distances are straight-line"})


def export_planning_areas() -> None:
    """Copy cached URA GeoJSON if present; else write zone centroid markers as fallback."""
    from . import ROOT

    cached = ROOT / "data" / "boundaries" / "planning_areas.geojson"
    dest = EXPORT_DIR / "planning_areas.geojson"
    if cached.exists() and cached.stat().st_size > 1000:
        shutil.copy(cached, dest)
        print(f"[export] planning_areas from cache ({cached.stat().st_size:,} bytes)", flush=True)
        return

    features = [
        {
            "type": "Feature",
            "properties": {"name": name, "kind": kind, "PLN_AREA_N": name},
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
        }
        for name, lat, lng, kind in SG_ZONES
    ]
    _write_json(
        dest,
        {
            "type": "FeatureCollection",
            "features": features,
            "note": "centroid fallback — place URA GeoJSON at data/boundaries/planning_areas.geojson",
        },
    )


def export_insights_copy() -> None:
    # Prefer local analytics_out, else sibling MVP
    sources = [
        OUT_DIR,
        Path(__file__).resolve().parents[2] / "VectorMobility MVP" / "data" / "analytics_out",
    ]
    src = next((p for p in sources if p.exists()), None)
    if not src:
        print("[export] no insights JSON found — skip copy", flush=True)
        return
    dest = EXPORT_DIR / "insights"
    dest.mkdir(parents=True, exist_ok=True)
    names = [
        "profile", "rhythms", "hotspots", "zone_activity", "od_flows",
        "home_work", "movement", "dwell", "anomalies", "pois",
        "data_quality", "poi_insights", "urban_context", "segments",
        "affinity", "purpose", "weighted", "uncertainty", "ses", "household",
        "dining", "retail", "routing", "embeddings", "granularity",
    ]
    for name in names:
        f = src / f"{name}.json"
        if f.exists():
            shutil.copy(f, dest / f"{name}.json")
    print(f"[export] copied insights from {src}", flush=True)


def export_cube_hex_hour(con) -> None:
    t0 = time.time()
    base = _rows(con, f"""
        SELECT h3_10,
               hour(ts) AS hour,
               CASE WHEN dayofweek(ts) IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
               {SOURCE_CLASS_SQL} AS source_class,
               count(*) AS pings,
               count(DISTINCT device_id) AS devices
        FROM pings
        WHERE h3_10 IS NOT NULL
        GROUP BY 1, 2, 3, 4
        HAVING count(DISTINCT device_id) >= {K}
    """)
    print(f"[export] cube_hex_hour base rows: {len(base):,} in {time.time() - t0:.1f}s", flush=True)

    rolled: dict[tuple, dict] = {}
    for row in base:
        parent = _parent(row["h3_10"], 8)
        if not parent:
            continue
        key = (parent, int(row["hour"]), row["daytype"], row["source_class"])
        slot = rolled.setdefault(key, {"devices": 0, "pings": 0})
        slot["devices"] += int(row["devices"])
        slot["pings"] += int(row["pings"])

    cells = [
        {
            "h3": h,
            "hour": hour,
            "daytype": daytype,
            "source_class": sc,
            "devices": v["devices"],
            "pings": v["pings"],
        }
        for (h, hour, daytype, sc), v in rolled.items()
        if v["devices"] >= K
    ]
    # Also a compact hourly calendar index (no hex) for calendar heatmap defaults
    calendar = _rows(con, f"""
        SELECT
          dayofweek(ts) AS dow,
          dayname(ts::DATE) AS day,
          hour(ts) AS hour,
          CASE WHEN dayofweek(ts) IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
          {SOURCE_CLASS_SQL} AS source_class,
          count(DISTINCT device_id) AS devices
        FROM pings
        GROUP BY 1, 2, 3, 4, 5
        HAVING count(DISTINCT device_id) >= {K}
        ORDER BY 1, 3
    """)

    _write_json(
        EXPORT_DIR / "cubes" / "cube_hex_hour.json",
        {"cells": cells, "calendar": calendar, "k": K, "resolution": 8},
    )
    print(f"[export] cube_hex_hour cells={len(cells):,} in {time.time() - t0:.1f}s", flush=True)


def export_cube_visits(con) -> None:
    # Visitor filter: home ≥400m
    con.execute("""
        CREATE OR REPLACE TEMP TABLE device_home AS
        SELECT device_id, median(lat) AS hlat, median(lng) AS hlng
        FROM stops
        WHERE (start_hour >= 21 OR start_hour <= 5) AND dwell_min >= 30
        GROUP BY 1 HAVING count(*) >= 3""")
    con.execute("""
        CREATE OR REPLACE TEMP VIEW visitor_visits AS
        SELECT v.*
        FROM visits v
        JOIN device_home h USING (device_id)
        WHERE hav_m(v.lat, v.lng, h.hlat, h.hlng) >= 400""")

    rows = _rows(con, f"""
        SELECT poi_category AS category,
               poi_group AS category_group,
               zone,
               start_hour AS hour,
               CASE WHEN dow IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
               count(DISTINCT device_id) AS devices,
               count(*) AS visits,
               round(median(dwell_min), 1) AS med_dwell_min
        FROM visitor_visits
        GROUP BY 1, 2, 3, 4, 5
        HAVING count(DISTINCT device_id) >= {K}
    """)

    # Compact group rhythms for small-multiples
    rhythms = _rows(con, f"""
        SELECT poi_group AS category_group,
               start_hour AS hour,
               CASE WHEN dow IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
               count(DISTINCT device_id) AS devices
        FROM visitor_visits
        GROUP BY 1, 2, 3
        HAVING count(DISTINCT device_id) >= {K}
        ORDER BY 1, 3, 2
    """)

    _write_json(
        EXPORT_DIR / "cubes" / "cube_visits.json",
        {"cells": rows, "group_rhythms": rhythms, "k": K, "visitor_home_m": 400},
    )
    print(f"[export] cube_visits cells={len(rows):,}", flush=True)


def export_cube_od(con) -> None:
    zones = {z: (lat, lng) for z, lat, lng, _ in SG_ZONES}
    rows = _rows(con, f"""
        SELECT o_zone, d_zone,
               {HOUR_BAND_SQL} AS hour_band,
               CASE WHEN dow IN (0,6) THEN 'weekend' ELSE 'weekday' END AS daytype,
               count(*) AS trips,
               count(DISTINCT device_id) AS devices,
               round(median(travel_min), 1) AS med_travel_min,
               round(median(dist_km), 2) AS med_dist_km
        FROM trips
        WHERE o_zone != d_zone
        GROUP BY 1, 2, 3, 4
        HAVING count(DISTINCT device_id) >= {K}
        ORDER BY trips DESC
    """)
    enriched = []
    for r in rows:
        o = zones.get(r["o_zone"])
        d = zones.get(r["d_zone"])
        if not o or not d:
            continue
        enriched.append({
            **r,
            "o_lat": o[0], "o_lng": o[1],
            "d_lat": d[0], "d_lng": d[1],
        })
    _write_json(
        EXPORT_DIR / "cubes" / "cube_od.json",
        {"cells": enriched, "k": K, "note": "distances are straight-line"},
    )
    print(f"[export] cube_od cells={len(enriched):,}", flush=True)


def export_profile_kpi(con) -> None:
    totals = _rows(con, """
        SELECT count(*) AS pings,
               count(DISTINCT device_id) AS devices,
               min(ts)::DATE AS first_day,
               max(ts)::DATE AS last_day
        FROM pings
    """)[0]
    _write_json(EXPORT_DIR / "kpi.json", totals)


def run_export(steps: list[str] | None = None) -> None:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    (EXPORT_DIR / "cubes").mkdir(parents=True, exist_ok=True)
    (EXPORT_DIR / "kepler").mkdir(parents=True, exist_ok=True)
    (EXPORT_DIR / "insights").mkdir(parents=True, exist_ok=True)

    all_steps = [
        "zones", "kepler", "hex", "od", "planning", "insights",
        "cube_hex", "cube_visits", "cube_od", "kpi",
    ]
    selected = set(steps) if steps else set(all_steps)

    con = connect(read_only=True)
    t0 = time.time()
    print(f"[export] DB={con.execute('SELECT current_database()').fetchone()} path via connect; EXPORT_DIR={EXPORT_DIR}", flush=True)

    if "zones" in selected:
        export_zones(con)
    if "kepler" in selected:
        export_kepler(con)
    if "hex" in selected:
        try:
            export_hex_density_from_pings(con)
        except Exception as e:
            print(f"[export] ping hex failed ({e}), trying stops…", flush=True)
            export_hex_density(con)
    if "od" in selected:
        export_od_arcs(con)
    if "planning" in selected:
        export_planning_areas()
    if "insights" in selected:
        export_insights_copy()
    if "cube_hex" in selected:
        export_cube_hex_hour(con)
    if "cube_visits" in selected:
        export_cube_visits(con)
    if "cube_od" in selected:
        export_cube_od(con)
    if "kpi" in selected:
        export_profile_kpi(con)

    print(f"[export] done in {time.time() - t0:.1f}s → {EXPORT_DIR}", flush=True)
