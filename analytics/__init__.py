"""Veraset mobility analytics engine (export-focused fork for the analytics app).

DuckDB-backed pipeline. Warehouse DB can live in this repo or an external path.

Usage:
    python3 -m analytics build      # build the warehouse (needs raw parquet)
    python3 -m analytics profile    # dataset overview
    python3 -m analytics insights   # run all analyses → data/analytics_out/
    python3 -m analytics export     # map/cube artifacts → public/data/
    python3 -m analytics sql "..."  # ad-hoc SQL
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Raw mobility source. "factori" = Factori Japan GCS parquet (the default for this
# Japan build); "veraset" = the legacy Singapore Veraset feed. Geo/time constants and
# the raw ping-ingestion SQL (see engine.build_pings) switch on this.
SOURCE = os.environ.get("MOBILITY_SOURCE", "factori").lower()

if SOURCE == "veraset":
    COUNTRY_CODE = "SG"
    TZ_OFFSET_HOURS = 8  # SGT
    LAT_MIN, LAT_MAX = 1.1, 1.5
    LNG_MIN, LNG_MAX = 103.5, 104.2
    PARQUET_GLOB = str(ROOT / "data/veraset_scratch/veraset/movement_eval/2026/06/*/*.gz.parquet")
    _DEFAULT_DB = "veraset.duckdb"
else:  # factori (Japan)
    COUNTRY_CODE = "JPN"
    TZ_OFFSET_HOURS = 9  # JST
    # Japan bounding box — clips stray overseas GPS fixes present in the raw feed.
    LAT_MIN, LAT_MAX = 20.0, 46.5
    LNG_MIN, LNG_MAX = 122.0, 154.5
    PARQUET_GLOB = str(ROOT / "data/factori_scratch/jp_raw/*.parquet")
    _DEFAULT_DB = "factori_jp.duckdb"

# Warehouse location: explicit path wins, else local data/. The sibling-MVP fallback
# only applies to the legacy Veraset build.
_env_db = os.environ.get("WAREHOUSE_PATH") or os.environ.get("VERASET_DUCKDB")
_DEFAULT_MVP = Path(__file__).resolve().parents[2] / "VectorMobility MVP" / "data" / "veraset.duckdb"
if _env_db:
    DB_PATH = Path(_env_db)
elif (ROOT / "data" / _DEFAULT_DB).exists():
    DB_PATH = ROOT / "data" / _DEFAULT_DB
elif SOURCE == "veraset" and _DEFAULT_MVP.exists():
    DB_PATH = _DEFAULT_MVP
else:
    DB_PATH = ROOT / "data" / _DEFAULT_DB

OUT_DIR = ROOT / "data" / "analytics_out"
EXPORT_DIR = Path(os.environ.get("EXPORT_DIR", str(ROOT / "public" / "data")))

MAX_ACCURACY_M = 200
MIN_K_ANON = 5
STOP_RADIUS_M = 250
STOP_MAX_GAP_MIN = 60
STOP_MIN_DWELL_MIN = 15
MIN_PINGS_TRAJ = 20
MIN_HOURS_TRAJ = 3
