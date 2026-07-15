"""Life-stage tags and occupation class (rules over visits + work anchors).

Non-exclusive life-stage tags sit beside primary commute segments.
Occupation class is a single first-match label on work context.

ACRA industry labels (optional) enrich occupation when acra_work_industry exists.
"""

from __future__ import annotations

import duckdb

from .segments import CBD_PAS

# Education leaf categories that signal school-age kids (exclude driving schools)
SCHOOL_CATS = (
    "('school','tuition','tutoring_service','junior_college',"
    "'primary_school','secondary_school','high_school')"
)
YOUNG_FAMILY_CATS = "('preschool','playground','day_care_preschool','child_care')"
SENIOR_CATS = "('senior_citizen_services','community_center','health_clinic')"
HOSPITAL_CATS = "('hospital','emergency_room')"
MALL_CATS = "('shopping_center','department_store','shopping_mall')"


def build_lifestage(con: duckdb.DuckDBPyConnection) -> None:
    """Add life-stage + occupation columns onto device_segments (in place rebuild)."""
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE ls_visits AS
        SELECT device_id,
          count(DISTINCT d) FILTER (
            start_hour BETWEEN 7 AND 9
            AND poi_category IN {YOUNG_FAMILY_CATS}
          ) AS young_family_days,
          count(DISTINCT d) FILTER (
            start_hour BETWEEN 7 AND 15 AND dow BETWEEN 1 AND 5
            AND (
              poi_category IN {SCHOOL_CATS}
              OR (poi_group = 'Education'
                  AND lower(poi_name) NOT LIKE '%driv%'
                  AND lower(poi_name) NOT LIKE '%bmw%'
                  AND lower(poi_name) NOT LIKE '%toyota%')
            )
          ) AS school_kid_days,
          count(DISTINCT d) FILTER (
            start_hour BETWEEN 9 AND 16 AND dow BETWEEN 1 AND 5
            AND (
              poi_category IN {SENIOR_CATS}
              OR lower(poi_name) LIKE '%polyclinic%'
              OR lower(poi_name) LIKE '%senior activity%'
              OR lower(poi_name) LIKE '%elderly%'
            )
          ) AS senior_days,
          count(*) FILTER (poi_category IN {HOSPITAL_CATS}) AS hospital_visits,
          count(*) FILTER (
            start_hour BETWEEN 7 AND 10 AND dow BETWEEN 1 AND 5
            AND poi_category IN {MALL_CATS}
          ) AS early_mall_visits,
          count(*) FILTER (
            start_hour BETWEEN 20 AND 23 AND dow BETWEEN 1 AND 5
            AND poi_category IN {MALL_CATS}
          ) AS late_mall_visits
        FROM visits
        GROUP BY 1""")

    # Work-side land-use at work anchor
    con.execute("""
        CREATE OR REPLACE TEMP TABLE work_anchors AS
        SELECT f.device_id, f.work_pa, f.home_pa,
               median(s.lat) AS wlat, median(s.lng) AS wlng,
               min(s.start_hour) AS work_arrive_hour,
               max(s.start_hour + cast(s.dwell_min / 60 AS INT)) AS work_leave_hour
        FROM device_features f
        JOIN stops s ON s.device_id = f.device_id
          AND s.start_hour BETWEEN 6 AND 20 AND s.dow BETWEEN 1 AND 5
          AND s.dwell_min >= 60
        WHERE f.work_pa IS NOT NULL
        GROUP BY f.device_id, f.work_pa, f.home_pa""")

    try:
        from .datagov import _load_spatial, DG
        _load_spatial(con)
        con.execute(f"""
            CREATE OR REPLACE TEMP TABLE work_lu AS
            SELECT w.device_id, any_value(l.LU_DESC) AS work_lu
            FROM work_anchors w
            JOIN (
              SELECT LU_DESC, geom,
                     ST_XMin(geom) AS xmin, ST_XMax(geom) AS xmax,
                     ST_YMin(geom) AS ymin, ST_YMax(geom) AS ymax
              FROM ST_Read('{DG / "landuse_mp2019.geojson"}')
              WHERE LU_DESC NOT IN ('ROAD')
            ) l ON w.wlng BETWEEN l.xmin AND l.xmax
               AND w.wlat BETWEEN l.ymin AND l.ymax
            WHERE ST_Contains(l.geom, ST_Point(w.wlng, w.wlat))
            GROUP BY 1""")
    except Exception as e:
        print(f"[build] work_lu skipped: {e}", flush=True)
        con.execute("""
            CREATE OR REPLACE TEMP TABLE work_lu AS
            SELECT device_id, NULL::VARCHAR AS work_lu FROM work_anchors WHERE false""")

    # Campus / education-zone daytime anchors (students)
    con.execute("""
        CREATE OR REPLACE TEMP TABLE campus_days AS
        SELECT s.device_id, count(DISTINCT s.d) AS edu_zone_days
        FROM stops s
        JOIN zones z ON z.kind = 'education'
          AND hav_m(s.lat, s.lng, z.zlat, z.zlng) < 800
        WHERE s.dwell_min >= 120 AND s.start_hour BETWEEN 8 AND 18
        GROUP BY 1""")

    has_acra = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = 'acra_work_industry'"
    ).fetchone()[0] > 0
    acra_sel = "awi.industry_label AS acra_industry," if has_acra else "NULL::VARCHAR AS acra_industry,"
    acra_join = "LEFT JOIN acra_work_industry awi USING (device_id)" if has_acra else ""

    con.execute(f"""
        CREATE OR REPLACE TABLE device_lifestage AS
        SELECT
          f.device_id,
          coalesce(lv.young_family_days, 0) >= 2 AS tag_young_family,
          coalesce(lv.school_kid_days, 0) >= 2 AS tag_school_age_kids,
          (coalesce(hd.dwelling, '') = 'campus'
             OR coalesce(cd.edu_zone_days, 0) >= 3) AS tag_student,
          (coalesce(lv.senior_days, 0) >= 2 AND f.work_pa IS NULL) AS tag_retiree_like,
          CASE
            WHEN coalesce(hd.dwelling, '') = 'industrial_dorm_like'
             AND (wl.work_lu IN ('BUSINESS 1','BUSINESS 2','BUSINESS PARK','PORT / AIRPORT')
                  OR f.work_pa IN ('TUAS','PIONEER','BOON LAY','MANDAI','SEMBAWANG',
                                    'SELETAR','CHANGI','PAYA LEBAR'))
              THEN 'construction_dorm'
            WHEN coalesce(lv.hospital_visits, 0) >= 3
              OR (f.night_work_days >= 3 AND coalesce(lv.hospital_visits, 0) >= 1)
              THEN 'hospital_shift'
            WHEN coalesce(lv.early_mall_visits, 0) >= 2
             AND coalesce(lv.late_mall_visits, 0) >= 2
              THEN 'retail_staff'
            WHEN f.work_pa IN {CBD_PAS} THEN 'office_cbd'
            WHEN wl.work_lu IN ('BUSINESS 1','BUSINESS 2','BUSINESS PARK','PORT / AIRPORT')
              OR f.work_pa IN ('TUAS','PIONEER','BOON LAY','MANDAI','SELETAR','CHANGI')
              THEN 'industrial'
            WHEN f.work_pa IS NOT NULL THEN 'other_work'
            ELSE 'no_work_anchor'
          END AS occupation_class,
          {acra_sel}
          wl.work_lu
        FROM device_features f
        LEFT JOIN ls_visits lv USING (device_id)
        LEFT JOIN campus_days cd USING (device_id)
        LEFT JOIN home_dwelling hd
          ON round(f.hlat, 4) = hd.hlat AND round(f.hlng, 4) = hd.hlng
        LEFT JOIN work_lu wl USING (device_id)
        {acra_join}
        """)

    # Merge tags onto device_segments for convenient downstream joins
    con.execute("""
        CREATE OR REPLACE TABLE device_segments AS
        SELECT s.*,
               coalesce(l.tag_young_family, false) AS tag_young_family,
               coalesce(l.tag_school_age_kids, false) AS tag_school_age_kids,
               coalesce(l.tag_student, false) AS tag_student,
               coalesce(l.tag_retiree_like, false) AS tag_retiree_like,
               coalesce(l.occupation_class, 'no_work_anchor') AS occupation_class,
               l.acra_industry, l.work_lu
        FROM device_segments s
        LEFT JOIN device_lifestage l USING (device_id)""")

    n = con.execute("""
        SELECT
          count(*) FILTER (tag_young_family) AS young_family,
          count(*) FILTER (tag_school_age_kids) AS school_kids,
          count(*) FILTER (tag_student) AS students,
          count(*) FILTER (tag_retiree_like) AS retirees
        FROM device_lifestage""").fetchone()
    occ = con.execute("""
        SELECT occupation_class, count(*) FROM device_lifestage
        GROUP BY 1 ORDER BY 2 DESC""").fetchall()
    print(f"[build] lifestage tags: young_family={n[0]:,} school_kids={n[1]:,} "
          f"students={n[2]:,} retirees={n[3]:,}; occupation={occ}", flush=True)
