#!/usr/bin/env python3
"""Stream a dense New Chitose Airport sample from the Factori Japan GCS bucket.

The full partition is ~236 GiB; we only need pings inside the airport footprint. This
downloads parts in batches, keeps only in-bbox rows via DuckDB, writes them to
data/factori_scratch/newchitose/, and deletes each raw batch so disk stays ~flat.
Resumable via a processed-parts manifest. Parts are device-disjoint, so more parts =
more unique devices/day at the airport (the full month supports ~1,700/day).

Usage:
    FACTORI_KEY=/path/to/sa.json python3 scripts/extract_factori_airport.py [NUM_PARTS] [BATCH]
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
SRC = "gs://factori-messynetwork/sample/mobility/year=2026/month=09/cntry=JPN"
OUT = ROOT / "data" / "factori_scratch" / "newchitose"
TMP = ROOT / "data" / "factori_scratch" / "_airport_tmp"
DONE = OUT / "_processed_parts.txt"

# New Chitose Airport footprint (terminals + apron/approach margin).
LAT_MIN, LAT_MAX = 42.76, 42.81
LNG_MIN, LNG_MAX = 141.66, 141.71

NUM_PARTS = int(sys.argv[1]) if len(sys.argv) > 1 else 400
BATCH = int(sys.argv[2]) if len(sys.argv) > 2 else 40


def sh(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, text=True, **kw)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    key = os.environ.get("FACTORI_KEY")
    if key:
        sh(["gcloud", "auth", "activate-service-account", f"--key-file={key}"],
           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Full manifest (cache locally).
    man = OUT / "_all_parts.txt"
    if not man.exists() or man.stat().st_size == 0:
        res = sh(["gsutil", "ls", f"{SRC}/"], capture_output=True)
        parts = [l for l in res.stdout.splitlines() if l.endswith(".parquet")]
        man.write_text("\n".join(parts))
    all_parts = [l for l in man.read_text().splitlines() if l.strip()]
    stride = max(1, len(all_parts) // NUM_PARTS)
    selected = all_parts[::stride][:NUM_PARTS]

    processed = set(DONE.read_text().splitlines()) if DONE.exists() else set()
    todo = [p for p in selected if p not in processed]
    print(f"[extract] {len(all_parts)} parts total; target {len(selected)} (stride {stride}); "
          f"{len(todo)} remaining", flush=True)

    con = duckdb.connect()
    con.execute("SET preserve_insertion_order=false")
    where = (f"latitude BETWEEN {LAT_MIN} AND {LAT_MAX} "
             f"AND longitude BETWEEN {LNG_MIN} AND {LNG_MAX} "
             f"AND horizontal_accuracy IS NOT NULL")

    for bstart in range(0, len(todo), BATCH):
        batch = todo[bstart:bstart + BATCH]
        import shutil
        shutil.rmtree(TMP, ignore_errors=True)
        TMP.mkdir(parents=True, exist_ok=True)
        # Download the batch.
        sh(["gsutil", "-m", "cp", *batch, f"{TMP}/"],
           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        glob = f"{TMP}/*.parquet"
        idx = bstart // BATCH
        # Name the output by the first part number in the batch so reruns/resumes never
        # overwrite earlier batch files (the run-local idx collides across runs).
        first_part = batch[0].rsplit("/", 1)[-1]
        tag = first_part.split("-")[1] if "-" in first_part else f"{idx:04d}"
        dest = OUT / f"airport_{tag}.parquet"
        n = con.execute(
            f"SELECT count(*) FROM read_parquet('{glob}') WHERE {where}"
        ).fetchone()[0]
        if n:
            con.execute(
                f"COPY (SELECT * FROM read_parquet('{glob}') WHERE {where}) "
                f"TO '{dest}' (FORMAT parquet)"
            )
        with DONE.open("a") as f:
            f.write("\n".join(batch) + "\n")
        shutil.rmtree(TMP, ignore_errors=True)
        print(f"[extract] batch {idx}: {len(batch)} parts -> {n:,} airport rows "
              f"({bstart + len(batch)}/{len(todo)} done)", flush=True)

    total = con.execute(
        f"SELECT count(*) AS c, count(distinct maid) AS d FROM read_parquet('{OUT}/airport_*.parquet')"
    ).fetchone() if list(OUT.glob("airport_*.parquet")) else (0, 0)
    print(f"[extract] DONE. airport pings={total[0]:,} devices={total[1]:,} in {OUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
