"""Overture Maps places (POI) enrichment.

Loads the Overture `place` theme (downloaded via `overturemaps download
--bbox=... -t place -f geoparquet`) into the warehouse and attributes stops to
POIs, so hotspots can be referenced to named venues instead of zone centroids.

Tables produced:
    pois   - named places: name, category leaf, category group, lat/lng, confidence
    visits - stops attributed to the nearest POI within ATTRIB_RADIUS_M
"""

from __future__ import annotations

import duckdb

from . import ROOT

PLACES_PARQUET = ROOT / "data/overture/places_sg.parquet"

MIN_CONFIDENCE = 0.4       # Overture's own POI existence confidence
ATTRIB_RADIUS_M = 120      # stop centroid must be this close to a POI
VISIT_MAX_DWELL_MIN = 360  # longer dwells are homes/workplaces, not venue visits
CELL = 0.002               # ~220 m join grid; neighbours cover ATTRIB_RADIUS_M

# Overture's own taxonomy hierarchy[1] provides the top-level bucket
# ("food_and_drink", "shopping", ...). Map to display labels.
GROUP_LABELS = {
    "food_and_drink": "Food & Drink",
    "shopping": "Shopping",
    "services_and_business": "Services & Business",
    "lifestyle_services": "Lifestyle Services",
    "education": "Education",
    "cultural_and_historic": "Cultural & Historic",
    "travel_and_transportation": "Transport & Travel",
    "health_care": "Health Care",
    "sports_and_recreation": "Sports & Recreation",
    "community_and_government": "Community & Government",
    "lodging": "Lodging",
    "arts_and_entertainment": "Arts & Entertainment",
    "geographic_entities": "Geographic",
}


def _category_group_sql(col: str) -> str:
    cases = "\n".join(f"WHEN '{k}' THEN '{v}'" for k, v in GROUP_LABELS.items())
    return f"CASE {col} {cases} ELSE 'Other' END"


def build_pois(con: duckdb.DuckDBPyConnection) -> None:
    if not PLACES_PARQUET.exists():
        raise FileNotFoundError(
            f"{PLACES_PARQUET} missing - run: overturemaps download "
            "--bbox=103.57,1.14,104.10,1.48 -f geoparquet -t place -o data/overture/places_sg.parquet"
        )
    con.execute(
        f"""
        CREATE OR REPLACE TABLE pois AS
        SELECT
          id,
          names."primary"       AS name,
          categories."primary"  AS category,
          {_category_group_sql('taxonomy.hierarchy[1]')} AS category_group,
          confidence,
          bbox.xmin::DOUBLE     AS lng,
          bbox.ymin::DOUBLE     AS lat
        FROM read_parquet('{PLACES_PARQUET}')
        WHERE names."primary" IS NOT NULL
          AND categories."primary" IS NOT NULL
          AND confidence >= {MIN_CONFIDENCE}
          AND coalesce(operating_status, 'open') != 'permanently_closed'
        """
    )


def build_visits(con: duckdb.DuckDBPyConnection) -> None:
    """Attribute venue-like stops (dwell <= VISIT_MAX_DWELL_MIN) to the nearest
    POI within ATTRIB_RADIUS_M using a grid-neighbourhood join."""
    con.execute(
        f"""
        CREATE OR REPLACE TABLE visits AS
        WITH s AS (
          SELECT *, floor(lat / {CELL})::INT AS cy, floor(lng / {CELL})::INT AS cx
          FROM stops
          WHERE dwell_min <= {VISIT_MAX_DWELL_MIN}
        ),
        p AS (
          SELECT *, floor(lat / {CELL})::INT AS cy, floor(lng / {CELL})::INT AS cx
          FROM pois
        ),
        candidates AS (
          SELECT
            s.device_id, s.start_ts, s.end_ts, s.dwell_min, s.start_hour, s.dow,
            s.d, s.zone, s.lat AS slat, s.lng AS slng,
            p.id AS poi_id, p.name, p.category, p.category_group,
            hav_m(s.lat, s.lng, p.lat, p.lng) AS dist_m
          FROM s
          JOIN p
            ON p.cy BETWEEN s.cy - 1 AND s.cy + 1
           AND p.cx BETWEEN s.cx - 1 AND s.cx + 1
          WHERE hav_m(s.lat, s.lng, p.lat, p.lng) <= {ATTRIB_RADIUS_M}
        )
        SELECT
          device_id, start_ts, end_ts, dwell_min, start_hour, dow, d, zone,
          slat AS lat, slng AS lng,
          arg_min(poi_id, dist_m)         AS poi_id,
          arg_min(name, dist_m)           AS poi_name,
          arg_min(category, dist_m)       AS poi_category,
          arg_min(category_group, dist_m) AS poi_group,
          min(dist_m)                     AS dist_m,
          count(*)                        AS pois_within_radius
        FROM candidates
        GROUP BY ALL
        """
    )
