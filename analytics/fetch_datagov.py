"""Fetch SES / ACRA civic datasets from data.gov.sg into data/datagov/.

Uses the public poll-download API (same pattern as LTA station names).
Idempotent: skips files that already exist.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from . import ROOT

DG = ROOT / "data/datagov"

DATASETS: dict[str, str] = {
    # Census 2020 HH income by PA (MP2019) — primary SES ecological validator
    "household_income_pa_census2020.csv": "d_2d6793de474551149c438ba349a108fd",
    # GHS 2015 income — secondary / catalogue continuity
    "household_income_pa_ghs2015.csv": "d_e2e2421777b5c2b6aff5db721d3dfabc",
    # HDB median resale by town × flat type
    "hdb_median_resale_by_town_flattype.csv": "d_b51323a474ba789fb4cc3db58a3116d4",
    # HDB block-level resale transactions (large) — for town aggregates
    "hdb_resale_prices_2017onwards.csv": "d_8b84c4ee58e3cfc0ece0d773c8ca6abc",
    # URA private residential rental index (CCR/RCR/OCR)
    "ura_private_rental_index.csv": "d_8e4c50283fb7052a391dfb746a05c853",
    # ACRA entities (large ~220 MB) — optional industry labels for work anchors
    "acra_entities.csv": "d_3f960c10fed6145404ca7b821f263b87",
}


def _ssl_env() -> dict[str, str]:
    env = os.environ.copy()
    if "SSL_CERT_FILE" not in env:
        try:
            import certifi
            env["SSL_CERT_FILE"] = certifi.where()
        except ImportError:
            pass
    return env


def poll_download(dataset_id: str, out: Path) -> Path:
    if out.exists() and out.stat().st_size > 0:
        return out
    env = _ssl_env()
    r = subprocess.run(
        ["curl", "-s",
         f"https://api-open.data.gov.sg/v1/public/api/datasets/{dataset_id}/poll-download"],
        capture_output=True, text=True, env=env)
    try:
        payload = json.loads(r.stdout)
    except json.JSONDecodeError as e:
        raise SystemExit(f"poll-download failed for {dataset_id}: {r.stdout[:200]}") from e
    url = (payload.get("data") or {}).get("url", "")
    if not url:
        raise SystemExit(f"no download URL for {dataset_id}: {payload}")
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sL", url, "-o", str(out)], check=True, env=env)
    print(f"[fetch] {out.name}: {out.stat().st_size // 1024:,} KB", flush=True)
    return out


def ensure_ses_files(*, include_acra: bool = False) -> None:
    DG.mkdir(parents=True, exist_ok=True)
    for name, did in DATASETS.items():
        if name == "acra_entities.csv" and not include_acra:
            continue
        try:
            poll_download(did, DG / name)
        except SystemExit as e:
            print(f"[fetch] skip {name}: {e}", flush=True)


def aggregate_hdb_town_medians(min_month: str = "2024-01") -> Path:
    """Build town × flat-type median resale from the block-level CSV."""
    import csv
    import statistics
    from collections import defaultdict

    src = DG / "hdb_resale_prices_2017onwards.csv"
    out = DG / "hdb_town_median_resale.csv"
    if not src.exists():
        return out
    prices: dict[tuple[str, str], list[float]] = defaultdict(list)
    town_prices: dict[str, list[float]] = defaultdict(list)
    with src.open() as f:
        for row in csv.DictReader(f):
            if row["month"] < min_month:
                continue
            town = row["town"].strip().upper()
            ft = row["flat_type"].strip().upper()
            p = float(row["resale_price"])
            prices[(town, ft)].append(p)
            town_prices[town].append(p)
    town_med = {t: statistics.median(v) for t, v in town_prices.items()}
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["town", "flat_type", "n", "median_price", "town_median_price"])
        for (town, ft), vals in sorted(prices.items()):
            w.writerow([town, ft, len(vals), int(statistics.median(vals)),
                        int(town_med[town])])
    print(f"[fetch] {out.name}: {len(town_med)} towns", flush=True)
    return out


def aggregate_acra_by_postal() -> Path | None:
    """Collapse ACRA entities to postal-code entity-type mix (warehouse-safe)."""
    import csv
    from collections import Counter, defaultdict

    src = DG / "acra_entities.csv"
    out = DG / "acra_postal_entity_mix.csv"
    if not src.exists():
        return None
    if out.exists() and out.stat().st_size > 0:
        return out
    by_postal: dict[str, Counter] = defaultdict(Counter)
    with src.open(newline="", errors="replace") as f:
        for row in csv.DictReader(f):
            if (row.get("uen_status_desc") or "").lower() != "registered":
                continue
            pc = (row.get("reg_postal_code") or "").strip()
            if len(pc) != 6 or not pc.isdigit():
                continue
            et = (row.get("entity_type_desc") or "Unknown").strip()
            by_postal[pc][et] += 1
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["postal_code", "sector", "n_entities", "top_entity_type", "top_n"])
        for pc, ctr in sorted(by_postal.items()):
            top, n = ctr.most_common(1)[0]
            w.writerow([pc, pc[:2], sum(ctr.values()), top, n])
    print(f"[fetch] {out.name}: {len(by_postal):,} postal codes", flush=True)
    return out


if __name__ == "__main__":
    include = "--acra" in sys.argv
    ensure_ses_files(include_acra=include)
    aggregate_hdb_town_medians()
    if include:
        aggregate_acra_by_postal()
