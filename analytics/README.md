# Mobility Analytics Engine (exports for this app)

DuckDB-backed analytics. Source is selected by `MOBILITY_SOURCE`
(`factori` = Factori Japan, default; `veraset` = legacy Singapore). The
warehouse defaults to `data/factori_jp.duckdb` (or `data/veraset.duckdb`);
override with `WAREHOUSE_PATH`.

## Setup

```bash
pip3 install -r ../requirements.txt   # or: pip3 install duckdb h3
# Fetch the Factori Japan sample (see ../scripts/fetch_factori_jp.sh), then:
python3 -m analytics build            # raw parquet → pings → … → trips → zones
```

## Export for the UI

```bash
python3 -m analytics export
# → public/data/{hex_density,od_arcs,planning_areas,kpi,zones}.json
# → public/data/cubes/{cube_hex_hour,cube_visits,cube_od}.json
# → public/data/kepler/*.csv
# → public/data/insights/*.json
```

Prefecture boundaries ship at `data/boundaries/japan_prefectures.geojson`
(copied into `public/data/planning_areas.geojson` on export).

## Other commands

```bash
python3 -m analytics profile
python3 -m analytics insights
python3 -m analytics sql "SELECT count(*) FROM trips"
```

## Guardrails

- k≥5 suppression at export
- Visitor/resident separation (home ≥400 m) on POI footfall cubes
- No per-device trajectories exported
