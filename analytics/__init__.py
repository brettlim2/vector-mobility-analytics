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

# Prefer explicit warehouse path, then local data/, then sibling MVP repo.
_DEFAULT_MVP = Path(__file__).resolve().parents[2] / "VectorMobility MVP" / "data" / "veraset.duckdb"
_env_db = os.environ.get("WAREHOUSE_PATH") or os.environ.get("VERASET_DUCKDB")
if _env_db:
    DB_PATH = Path(_env_db)
elif (ROOT / "data" / "veraset.duckdb").exists():
    DB_PATH = ROOT / "data" / "veraset.duckdb"
elif _DEFAULT_MVP.exists():
    DB_PATH = _DEFAULT_MVP
else:
    DB_PATH = ROOT / "data" / "veraset.duckdb"

PARQUET_GLOB = str(ROOT / "data/veraset_scratch/veraset/movement_eval/2026/06/*/*.gz.parquet")
OUT_DIR = ROOT / "data" / "analytics_out"
EXPORT_DIR = Path(os.environ.get("EXPORT_DIR", str(ROOT / "public" / "data")))

TZ_OFFSET_HOURS = 8
MAX_ACCURACY_M = 200
MIN_K_ANON = 5
STOP_RADIUS_M = 250
STOP_MAX_GAP_MIN = 60
STOP_MIN_DWELL_MIN = 15
MIN_PINGS_TRAJ = 20
MIN_HOURS_TRAJ = 3
