# Vector Mobility Analytics

Interactive geospatial analytics over the Veraset Singapore warehouse
(DuckDB → static cubes → MapLibre + deck.gl). Phases 1–2 of the mobility
analytics roadmap: hex density, OD arcs, planning-area boundaries, filter
cubes, calendar heatmap, and POI rhythm small-multiples.

## Public demo

Static build (warehouse exports baked into `public/data/`):

**https://brettlim2.github.io/vector-mobility-analytics/**

Re-export + push to refresh the cached cubes:

```bash
python3 -m analytics export
npm run build
git add public/data && git commit -m "Refresh analytics exports" && git push
```

## Quick start

```bash
# 1. Python deps (uses warehouse at WAREHOUSE_PATH or sibling MVP data/)
pip3 install -r requirements.txt

# Point at the DuckDB warehouse if not auto-detected:
export WAREHOUSE_PATH="/path/to/veraset.duckdb"

# 2. Export map layers + cubes into public/data/
python3 -m analytics export

# Optional: download URA planning areas into data/boundaries/ first
# (curl the data.gov.sg poll-download URL) — export will copy them.

# 3. Run the UI
npm install
npm run dev
```

## Filters (URL-shareable)

| param | meaning |
|---|---|
| `daytype` | weekday / weekend |
| `daypart` | morning / midday / evening / night (hex) |
| `hourBand` | am / pm / late / offpeak (OD) |
| `source` | sdk_app / agg / all |
| `h3` | 7 / 8 / 9 |
| `zone` | named zone |
| `category` | POI category group |

Example: `?daytype=weekday&hourBand=am&source=sdk_app&h3=8`

## Export artifacts (`public/data/`)

| path | content |
|---|---|
| `hex_density.json` | H3 res 7/8/9 × daypart device counts |
| `od_arcs.json` | zone→zone arcs by hour band |
| `planning_areas.geojson` | URA MP2025 planning areas |
| `cubes/cube_hex_hour.json` | h3_res8 × hour × daytype × source_class |
| `cubes/cube_visits.json` | visitor POI footfall cube + group rhythms |
| `cubes/cube_od.json` | OD × hour_band × daytype |
| `kepler/*.csv` | drop into kepler.gl for internal exploration |
| `insights/*.json` | copied warehouse insight payloads |

All aggregates are k≥5 suppressed at export. POI footfall uses visitor-only
rows (home ≥400 m from venue).

## Guardrails

- No per-device trajectories in the UI
- Prefer SDK/app feed for hourly axes (agg has a UTC-midnight step ≈ 08:00 SGT)
- Straight-line distances labelled as such

## Commands

```bash
python3 -m analytics export                 # all artifacts
python3 -m analytics export --only hex od   # subset
python3 -m analytics sql "SELECT count(*) FROM trips"
python3 -m analytics profile
```
