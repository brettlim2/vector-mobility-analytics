"""CLI entry point: python3 -m analytics <command>."""

from __future__ import annotations

import argparse
import json


def main() -> int:
    p = argparse.ArgumentParser(prog="analytics", description="Veraset mobility analytics engine")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="build/rebuild the DuckDB warehouse")
    b.add_argument(
        "--steps",
        nargs="*",
        choices=[
            "zones", "pings", "devices", "stops", "trips", "pois", "visits",
            "context", "stop_pa", "segments", "weights", "purpose", "ses",
            "acra", "lifestage", "household", "sequences", "routing",
        ],
        help="rebuild only these steps (default: all)",
    )

    sub.add_parser("profile", help="print dataset overview")

    i = sub.add_parser("insights", help="run all analyses, write JSON to data/analytics_out/")
    i.add_argument("--only", nargs="*", help="run only these analyses (by name)")

    e = sub.add_parser("export", help="export map layers + cubes to public/data/")
    e.add_argument(
        "--only",
        nargs="*",
        choices=[
            "zones", "kepler", "hex", "od", "planning", "insights",
            "cube_hex", "cube_visits", "cube_od", "kpi",
        ],
        help="export only these artifacts",
    )

    q = sub.add_parser("sql", help="run ad-hoc SQL against the warehouse")
    q.add_argument("query")

    args = p.parse_args()

    if args.cmd == "build":
        from .engine import build
        build(args.steps)
    elif args.cmd == "profile":
        from .insights import run_profile
        print(json.dumps(run_profile(), indent=2, default=str))
    elif args.cmd == "insights":
        from .insights import run_all
        run_all(args.only)
    elif args.cmd == "export":
        from .export_layers import run_export
        run_export(args.only)
    elif args.cmd == "sql":
        from .engine import connect
        con = connect(read_only=True)
        print(con.sql(args.query))
    return 0
