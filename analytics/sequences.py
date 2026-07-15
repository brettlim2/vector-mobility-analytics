"""Device-day visit sequences for embedding training.

Materialises `device_day_tokens` — ordered POI category / brand tokens per
(device_id, d). Training (word2vec) lives in scripts/train_embeddings.py;
this module only builds the warehouse table.
"""

from __future__ import annotations

import duckdb


def build_sequences(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE OR REPLACE TABLE device_day_tokens AS
        SELECT device_id, d,
               list(coalesce(
                 nullif(poi_brand, ''),
                 poi_category,
                 poi_group
               ) ORDER BY start_ts) AS tokens,
               count(*) AS n_tokens
        FROM visits
        WHERE poi_category IS NOT NULL OR poi_group IS NOT NULL
        GROUP BY 1, 2
        HAVING count(*) >= 2""")
    n = con.execute("SELECT count(*), count(DISTINCT device_id) FROM device_day_tokens").fetchone()
    print(f"[build] device_day_tokens: {n[0]:,} device-days, {n[1]:,} devices", flush=True)
