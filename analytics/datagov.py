"""data.gov.sg context layer.

Loads official Singapore datasets (downloaded to data/datagov/ via the
data.gov.sg poll-download API) into the warehouse:

    planning_areas  - URA Master Plan 2019 planning area polygons (real boundaries)
    pa_population   - Census 2020 residents per planning area
    holidays        - public holidays 2026 (June 1 = Vesak Day observed!)
    hawkers         - NEA hawker centres (name, cooked-food stalls, point)
    mrt_exits       - LTA MRT station exits (station, exit, point)
    mode_share      - Census: usual mode of transport to work by home planning area
    travel_time     - Census: travelling time bands by workplace planning area
    rainfall        - NEA station rainfall aggregated to island-hourly (June 2026)
    hh_income       - Census 2020 household income by planning area (SES validator)
    hdb_town_price  - HDB town median resale (2024+ transactions)
    private_price   - Private residential price proxy by PA (CCR/RCR/OCR/landed)

Also stamps stops with their true planning area (point-in-polygon via the
DuckDB spatial extension, joined through a 110 m grid for speed).
"""

from __future__ import annotations

import duckdb

from . import ROOT

_LOCAL_DG = ROOT / "data/datagov"
_MVP_DG = ROOT.parent / "VectorMobility MVP" / "data/datagov"
DG = _LOCAL_DG if _LOCAL_DG.exists() else _MVP_DG

# Known landed-heavy planning areas (when land-use is generic RESIDENTIAL
# and the home cell is not an HDB hit).
LANDED_PAS = "('BUKIT TIMAH','TANGLIN','SOUTHERN ISLANDS','LIM CHU KANG')"


def _load_spatial(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("INSTALL spatial; LOAD spatial")


def build_context(con: duckdb.DuckDBPyConnection) -> None:
    _load_spatial(con)

    con.execute(f"""
        CREATE OR REPLACE TABLE planning_areas AS
        SELECT PLN_AREA_N AS pa, REGION_N AS region, geom
        FROM ST_Read('{DG / "planning_areas_mp2019.geojson"}')""")

    # Census CSV mixes planning-area and subzone rows; keep rows whose name
    # matches an MP2019 planning area.
    # Census 2020 population per planning area, from the age-structure file
    # whose PA rows are marked "<PA> - Total". (The ethnic-group file first used
    # here turned out to be Census 2010 — kept only as fallback.)
    age_file = DG / "population_pa_age_census2020.csv"
    if age_file.exists():
        con.execute(f"""
            CREATE OR REPLACE TABLE pa_population AS
            SELECT upper(trim(replace(Number, ' - Total', ''))) AS pa,
                   max(try_cast(Total_Total AS BIGINT)) AS residents
            FROM read_csv('{age_file}', header=true, all_varchar=true)
            WHERE Number LIKE '% - Total'
              AND upper(trim(replace(Number, ' - Total', ''))) IN (SELECT pa FROM planning_areas)
              AND try_cast(Total_Total AS BIGINT) IS NOT NULL
            GROUP BY 1""")
    else:
        con.execute(f"""
            CREATE OR REPLACE TABLE pa_population AS
            SELECT upper(Number) AS pa, max(try_cast(Total_Total AS BIGINT)) AS residents
            FROM read_csv('{DG / "population_pa_ethnic_census2010.csv"}', header=true, all_varchar=true)
            WHERE upper(Number) IN (SELECT pa FROM planning_areas)
              AND try_cast(Total_Total AS BIGINT) IS NOT NULL
            GROUP BY 1""")

    con.execute(f"""
        CREATE OR REPLACE TABLE holidays AS
        SELECT "date"::DATE AS d, holiday
        FROM read_csv('{DG / "public_holidays_2026.csv"}', header=true)""")

    con.execute(f"""
        CREATE OR REPLACE TABLE hawkers AS
        SELECT NAME AS name,
               try_cast(NUMBER_OF_COOKED_FOOD_STALLS AS INT) AS stalls,
               ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lng
        FROM ST_Read('{DG / "hawker_centres.geojson"}')
        WHERE STATUS = 'Existing'""")

    con.execute(f"""
        CREATE OR REPLACE TABLE mrt_exits AS
        SELECT STATION_NA AS station, EXIT_CODE AS exit,
               ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lng
        FROM ST_Read('{DG / "mrt_station_exits.geojson"}')""")

    con.execute(f"""
        CREATE OR REPLACE TABLE mode_share AS
        SELECT upper(Number) AS pa,
               try_cast(Total AS BIGINT) AS workers,
               coalesce(try_cast(PublicBusOnly AS BIGINT), 0)
                 + coalesce(try_cast(MRTOnly AS BIGINT), 0)
                 + coalesce(try_cast(MRTandPublicBusOnly AS BIGINT), 0) AS public_transit,
               coalesce(try_cast(CarOnly AS BIGINT), 0)
                 + coalesce(try_cast(MRTandCarOnly AS BIGINT), 0) AS car,
               try_cast(NoTransportRequired AS BIGINT) AS no_transport
        FROM read_csv('{DG / "mode_of_transport_pa.csv"}', header=true, all_varchar=true)
        WHERE upper(Number) IN (SELECT pa FROM planning_areas)
          AND try_cast(Total AS BIGINT) IS NOT NULL""")

    con.execute(f"""
        CREATE OR REPLACE TABLE travel_time AS
        SELECT upper(Number) AS workplace_pa,
               try_cast(Total AS BIGINT) AS workers,
               try_cast(Upto15mins AS BIGINT) AS m0_15,
               try_cast("16_30mins" AS BIGINT) AS m16_30,
               try_cast("31_45mins" AS BIGINT) AS m31_45,
               try_cast("46_60mins" AS BIGINT) AS m46_60,
               try_cast(Morethan60mins AS BIGINT) AS m60p
        FROM read_csv('{DG / "workplace_pa_travel_time.csv"}', header=true, all_varchar=true)
        WHERE upper(Number) IN (SELECT pa FROM planning_areas)
          AND try_cast(Total AS BIGINT) IS NOT NULL""")

    # Census 2020 age structure per planning area (same max-per-name dedupe as
    # pa_population: the CSV interleaves PA and same-named subzone rows).
    age = DG / "population_pa_age_census2020.csv"
    if age.exists():
        con.execute(f"""
            CREATE OR REPLACE TABLE pa_age AS
            WITH raw AS (
              -- this census file marks planning-area rows as "<PA> - Total"
              SELECT upper(trim(replace(Number, ' - Total', ''))) AS pa,
                     max(try_cast(Total_Total AS BIGINT)) AS total,
                     max(coalesce(try_cast(Total_0_4 AS BIGINT), 0) + coalesce(try_cast(Total_5_9 AS BIGINT), 0)
                       + coalesce(try_cast(Total_10_14 AS BIGINT), 0) + coalesce(try_cast(Total_15_19 AS BIGINT), 0)
                       + coalesce(try_cast(Total_20_24 AS BIGINT), 0)) AS age_0_24,
                     max(coalesce(try_cast(Total_65_69 AS BIGINT), 0) + coalesce(try_cast(Total_70_74 AS BIGINT), 0)
                       + coalesce(try_cast(Total_75_79 AS BIGINT), 0) + coalesce(try_cast(Total_80_84 AS BIGINT), 0)
                       + coalesce(try_cast(Total_85_89 AS BIGINT), 0) + coalesce(try_cast(Total_90andOver AS BIGINT), 0)) AS age_65p
              FROM read_csv('{age}', header=true, all_varchar=true)
              WHERE Number LIKE '% - Total'
                AND upper(trim(replace(Number, ' - Total', ''))) IN (SELECT pa FROM planning_areas)
                AND try_cast(Total_Total AS BIGINT) IS NOT NULL
              GROUP BY 1
            )
            SELECT pa, total AS residents,
                   round(age_0_24 / total::DOUBLE, 3) AS young_share,
                   round(age_65p / total::DOUBLE, 3) AS senior_share
            FROM raw WHERE total > 0""")

    rain = DG / "rainfall_jun2026_hourly.csv"
    if rain.exists():
        con.execute(f"""
            CREATE OR REPLACE TABLE rainfall AS
            SELECT hour_sgt::TIMESTAMP AS hh,
                   mm_island_mean::DOUBLE AS mm,
                   wet_station_share::DOUBLE AS wet_share
            FROM read_csv('{rain}', header=true)""")

    # Census 2020 HH income by PA — mid-bin estimated mean for ecological SES validation
    income = DG / "household_income_pa_census2020.csv"
    if income.exists():
        con.execute(f"""
            CREATE OR REPLACE TABLE hh_income AS
            WITH raw AS (
              SELECT upper(trim(Number)) AS pa,
                     try_cast(Total AS BIGINT) AS households,
                     coalesce(try_cast(NoEmployedPerson AS BIGINT), 0) AS n_none,
                     coalesce(try_cast(Below_1_000 AS BIGINT), 0) AS b0,
                     coalesce(try_cast("1_000_1_999" AS BIGINT), 0) AS b1,
                     coalesce(try_cast("2_000_2_999" AS BIGINT), 0) AS b2,
                     coalesce(try_cast("3_000_3_999" AS BIGINT), 0) AS b3,
                     coalesce(try_cast("4_000_4_999" AS BIGINT), 0) AS b4,
                     coalesce(try_cast("5_000_5_999" AS BIGINT), 0) AS b5,
                     coalesce(try_cast("6_000_6_999" AS BIGINT), 0) AS b6,
                     coalesce(try_cast("7_000_7_999" AS BIGINT), 0) AS b7,
                     coalesce(try_cast("8_000_8_999" AS BIGINT), 0) AS b8,
                     coalesce(try_cast("9_000_9_999" AS BIGINT), 0) AS b9,
                     coalesce(try_cast("10_000_10_999" AS BIGINT), 0) AS b10,
                     coalesce(try_cast("11_000_11_999" AS BIGINT), 0) AS b11,
                     coalesce(try_cast("12_000_12_999" AS BIGINT), 0) AS b12,
                     coalesce(try_cast("13_000_13_999" AS BIGINT), 0) AS b13,
                     coalesce(try_cast("14_000_14_999" AS BIGINT), 0) AS b14,
                     coalesce(try_cast("15_000_17_499" AS BIGINT), 0) AS b15,
                     coalesce(try_cast("17_500_19_999" AS BIGINT), 0) AS b17,
                     coalesce(try_cast("20_000andOver" AS BIGINT), 0) AS b20
              FROM read_csv('{income}', header=true, all_varchar=true)
              WHERE upper(trim(Number)) IN (SELECT pa FROM planning_areas)
                AND try_cast(Total AS BIGINT) IS NOT NULL
            )
            SELECT pa, households,
                   round((b0*500 + b1*1500 + b2*2500 + b3*3500 + b4*4500 + b5*5500
                        + b6*6500 + b7*7500 + b8*8500 + b9*9500 + b10*10500
                        + b11*11500 + b12*12500 + b13*13500 + b14*14500
                        + b15*16250 + b17*18750 + b20*25000)
                        / nullif(households - n_none, 0)::DOUBLE, 0) AS census_est_mean_income,
                   round((b10+b11+b12+b13+b14+b15+b17+b20)
                        / nullif(households, 0)::DOUBLE, 3) AS share_ge_10k,
                   round((b15+b17+b20) / nullif(households, 0)::DOUBLE, 3) AS share_ge_15k
            FROM raw""")

    hdb_med = DG / "hdb_town_median_resale.csv"
    if not hdb_med.exists():
        hdb_med = DG / "hdb_median_resale_by_town_flattype.csv"
    if hdb_med.exists():
        # Prefer pre-aggregated town medians; fall back to quarterly median file
        cols = open(hdb_med).readline().lower()
        if "town_median_price" in cols:
            con.execute(f"""
                CREATE OR REPLACE TABLE hdb_town_price AS
                SELECT upper(town) AS town,
                       max(town_median_price::DOUBLE) AS median_price
                FROM read_csv('{hdb_med}', header=true)
                GROUP BY 1""")
        else:
            con.execute(f"""
                CREATE OR REPLACE TABLE hdb_town_price AS
                WITH latest AS (
                  SELECT max(quarter) AS q FROM read_csv('{hdb_med}', header=true)
                  WHERE try_cast(price AS DOUBLE) IS NOT NULL
                )
                SELECT upper(town) AS town,
                       median(try_cast(price AS DOUBLE)) AS median_price
                FROM read_csv('{hdb_med}', header=true), latest
                WHERE quarter = latest.q AND try_cast(price AS DOUBLE) IS NOT NULL
                GROUP BY 1""")

    priv = DG / "private_resi_price_index_pa.csv"
    if priv.exists():
        con.execute(f"""
            CREATE OR REPLACE TABLE private_price AS
            SELECT upper(pa) AS pa, ura_region, price_index::DOUBLE AS price_index
            FROM read_csv('{priv}', header=true)""")

    for t in ["planning_areas", "pa_population", "pa_age", "holidays", "hawkers",
              "mrt_exits", "mode_share", "travel_time", "rainfall",
              "hh_income", "hdb_town_price", "private_price"]:
        try:
            n = con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            print(f"[build] {t}: {n:,} rows", flush=True)
        except duckdb.CatalogException:
            print(f"[build] {t}: skipped (source missing)", flush=True)


def build_dwellings(con: duckdb.DuckDBPyConnection) -> None:
    """Classify every distinct device home-anchor cell as hdb / private
    residential / landed / industrial-dorm-like / hotel-area / campus / other,
    and attach a continuous home_value_proxy for SES scoring.

    Requires device_features (for home coordinates); produces `home_dwelling`
    keyed by rounded home cell, joined back by the segments build.
    """
    _load_spatial(con)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE home_cells AS
        SELECT DISTINCT round(hlat, 4) AS hlat, round(hlng, 4) AS hlng
        FROM device_features WHERE hlat IS NOT NULL""")

    # ~35 m tolerance: GPS jitter + building setback
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE hdb_bbox AS
        SELECT geom, ST_XMin(geom) AS xmin, ST_XMax(geom) AS xmax,
               ST_YMin(geom) AS ymin, ST_YMax(geom) AS ymax
        FROM ST_Read('{DG / "hdb_buildings.geojson"}')""")
    con.execute("""
        CREATE OR REPLACE TEMP TABLE hdb_hit AS
        SELECT DISTINCT c.hlat, c.hlng
        FROM home_cells c JOIN hdb_bbox b
          ON c.hlng BETWEEN b.xmin - 0.0003 AND b.xmax + 0.0003
         AND c.hlat BETWEEN b.ymin - 0.0003 AND b.ymax + 0.0003
        WHERE ST_Distance(b.geom, ST_Point(c.hlng, c.hlat)) < 0.0003""")

    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE lu_bbox AS
        SELECT LU_DESC, geom,
               ST_XMin(geom) AS xmin, ST_XMax(geom) AS xmax,
               ST_YMin(geom) AS ymin, ST_YMax(geom) AS ymax
        FROM ST_Read('{DG / "landuse_mp2019.geojson"}')
        WHERE LU_DESC NOT IN ('ROAD')""")
    con.execute("""
        CREATE OR REPLACE TEMP TABLE lu_hit AS
        SELECT c.hlat, c.hlng, any_value(l.LU_DESC) AS lu_desc
        FROM home_cells c JOIN lu_bbox l
          ON c.hlng BETWEEN l.xmin AND l.xmax
         AND c.hlat BETWEEN l.ymin AND l.ymax
        WHERE ST_Contains(l.geom, ST_Point(c.hlng, c.hlat))
        GROUP BY 1, 2""")

    # Home cell → planning area (for value join)
    con.execute("""
        CREATE OR REPLACE TEMP TABLE home_pa_cell AS
        SELECT c.hlat, c.hlng, any_value(p.pa) AS pa
        FROM home_cells c
        JOIN planning_areas p
          ON ST_Contains(p.geom, ST_Point(c.hlng, c.hlat))
        GROUP BY 1, 2""")

    has_hdb_price = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = 'hdb_town_price'"
    ).fetchone()[0] > 0
    has_priv = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = 'private_price'"
    ).fetchone()[0] > 0

    # HDB towns ≈ PA names; CBD PAs collapse to CENTRAL AREA in HDB tables
    hdb_join = """
        LEFT JOIN hdb_town_price hp ON hp.town = CASE
          WHEN pa.pa IN ('DOWNTOWN CORE','SINGAPORE RIVER','MUSEUM','OUTRAM',
                         'ROCHOR','ORCHARD','NEWTON','RIVER VALLEY','MARINA SOUTH')
               THEN 'CENTRAL AREA'
          ELSE pa.pa END""" if has_hdb_price else ""
    priv_join = "LEFT JOIN private_price pp ON pp.pa = pa.pa" if has_priv else ""
    hdb_val = "hp.median_price" if has_hdb_price else "NULL"
    # price_index is already absolute-style $/psf proxy; scale to SGD-ish level
    priv_val = "pp.price_index * 1000.0" if has_priv else "NULL"

    con.execute(f"""
        CREATE OR REPLACE TABLE home_dwelling AS
        SELECT c.hlat, c.hlng, l.lu_desc, pa.pa AS cell_pa,
               CASE
                 WHEN h.hlat IS NOT NULL THEN 'hdb'
                 WHEN l.lu_desc ILIKE '%DETACHED%'
                   OR l.lu_desc ILIKE '%SEMI-DETACHED%'
                   OR l.lu_desc ILIKE '%TERRACE%'
                   OR (l.lu_desc LIKE 'RESIDENTIAL%'
                       AND pa.pa IN {LANDED_PAS})
                      THEN 'landed'
                 WHEN l.lu_desc LIKE 'RESIDENTIAL%'
                   OR l.lu_desc = 'COMMERCIAL & RESIDENTIAL'
                      THEN 'private_residential'
                 WHEN l.lu_desc IN ('BUSINESS 1', 'BUSINESS 2', 'BUSINESS PARK',
                                    'PORT / AIRPORT') THEN 'industrial_dorm_like'
                 WHEN l.lu_desc = 'HOTEL' THEN 'hotel_area'
                 WHEN l.lu_desc IN ('EDUCATIONAL INSTITUTION') THEN 'campus'
                 ELSE 'other'
               END AS dwelling,
               CASE
                 WHEN h.hlat IS NOT NULL THEN coalesce({hdb_val}, 550000)
                 WHEN l.lu_desc ILIKE '%DETACHED%'
                   OR l.lu_desc ILIKE '%SEMI-DETACHED%'
                   OR l.lu_desc ILIKE '%TERRACE%'
                   OR (l.lu_desc LIKE 'RESIDENTIAL%' AND pa.pa IN {LANDED_PAS})
                      THEN coalesce({priv_val}, 4200000)
                 WHEN l.lu_desc LIKE 'RESIDENTIAL%'
                   OR l.lu_desc = 'COMMERCIAL & RESIDENTIAL'
                      THEN coalesce({priv_val}, 1900000)
                 WHEN l.lu_desc IN ('BUSINESS 1', 'BUSINESS 2', 'BUSINESS PARK',
                                    'PORT / AIRPORT') THEN 80000
                 WHEN l.lu_desc = 'HOTEL' THEN 120000
                 WHEN l.lu_desc IN ('EDUCATIONAL INSTITUTION') THEN 100000
                 ELSE 250000
               END AS home_value_proxy
        FROM home_cells c
        LEFT JOIN hdb_hit h USING (hlat, hlng)
        LEFT JOIN lu_hit l USING (hlat, hlng)
        LEFT JOIN home_pa_cell pa USING (hlat, hlng)
        {hdb_join}
        {priv_join}""")
    n = con.execute("""SELECT dwelling, count(*),
                              round(median(home_value_proxy), 0) AS med_value
                       FROM home_dwelling GROUP BY 1 ORDER BY 2 DESC""").fetchall()
    print(f"[build] home_dwelling cells: {n}", flush=True)


def build_stop_pa(con: duckdb.DuckDBPyConnection) -> None:
    """Stamp stops with their true MP2019 planning area via a grid-cell
    point-in-polygon join (39K distinct cells instead of 4.25M points)."""
    _load_spatial(con)
    con.execute("""
        CREATE OR REPLACE TABLE pa_grid AS
        WITH cells AS (
          SELECT DISTINCT round(lat, 3) AS clat, round(lng, 3) AS clng FROM stops
        )
        SELECT c.clat, c.clng, any_value(p.pa) AS pa
        FROM cells c
        JOIN planning_areas p
          ON ST_Contains(p.geom, ST_Point(c.clng, c.clat))
        GROUP BY 1, 2""")
    con.execute("ALTER TABLE stops ADD COLUMN IF NOT EXISTS pa VARCHAR")
    con.execute("""
        UPDATE stops s SET pa = g.pa
        FROM pa_grid g
        WHERE round(s.lat, 3) = g.clat AND round(s.lng, 3) = g.clng""")
    n = con.execute("SELECT count(*) FILTER (pa IS NOT NULL), count(*) FROM stops").fetchone()
    print(f"[build] stops.pa: {n[0]:,}/{n[1]:,} stops inside a planning area", flush=True)
