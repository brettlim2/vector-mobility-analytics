# Veraset Mobility Analytics Engine (exports for this app)

DuckDB-backed analytics. The warehouse may live here or at `WAREHOUSE_PATH`
(defaults to sibling `VectorMobility MVP/data/veraset.duckdb` when present).

## Setup

```bash
pip3 install -r ../requirements.txt   # or: pip3 install duckdb h3
export WAREHOUSE_PATH="/path/to/veraset.duckdb"   # if needed
```

## Export for the UI

```bash
python3 -m analytics export
# → public/data/{hex_density,od_arcs,planning_areas,kpi,zones}.json
# → public/data/cubes/{cube_hex_hour,cube_visits,cube_od}.json
# → public/data/kepler/*.csv
# → public/data/insights/*.json
```

Place URA Master Plan planning-area GeoJSON at
`data/boundaries/planning_areas.geojson` so export copies it into `public/data/`.

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
