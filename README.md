# Vector Mobility Analytics

Interactive geospatial analytics over the Veraset Singapore warehouse
(DuckDB → static cubes → MapLibre + deck.gl). Hex density, OD arcs,
planning-area boundaries, filter cubes, calendar heatmap, POI rhythms, and
warehouse insight views for routing, dining × SES, retail missions, affinity,
audience segments, and urban context.

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

# 2. Regenerate warehouse insights, then export map layers + cubes
python3 -m analytics insights
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
| `h3` | 7 / 8 / 9 / 10 |
| `zone` | named zone |
| `category` | POI category group |

Example: `?daytype=weekday&hourBand=am&source=sdk_app&h3=8`

## Export artifacts (`public/data/`)

| path | content |
|---|---|
| `hex_density.json` | H3 res 7/8/9/10 × daypart device counts |
| `od_arcs.json` | zone→zone arcs by hour band |
| `planning_areas.geojson` | URA MP2025 planning areas |
| `cubes/cube_hex_hour.json` | h3_res8 × hour × daytype × source_class |
| `cubes/cube_visits.json` | visitor POI footfall cube + group rhythms |
| `cubes/cube_od.json` | OD × hour_band × daytype |
| `kepler/*.csv` | drop into kepler.gl for internal exploration |
| `insights/home_work.json` | home/work anchors, commute flows and distances |
| `insights/zone_activity.json` | zone activity, day/night and weekend shifts |
| `insights/poi_insights.json` | POI attribution, venues, brands and catchments |
| `insights/movement.json`, `dwell.json` | trip and dwell distributions |
| `insights/anomalies.json`, `data_quality.json` | burst events and feed-quality diagnostics |
| `insights/segments.json`, `ses.json` | mobility segments and socioeconomic quintiles |
| `insights/purpose.json`, `urban_context.json` | inferred trip purpose and external context |
| `insights/household.json` | privacy-safe household distributions and co-movement proxies |
| `insights/dining.json` | dining format / cuisine / meal occasions by SES |
| `insights/retail.json` | mall missions, loyalty, heartland vs regional |
| `insights/routing.json` | OSRM circuity, mode inference, drive-time catchments |
| `insights/affinity.json` | category / brand / mall co-visit lift |
| `insights/weighted.json`, `uncertainty.json` | post-stratified population view and jackknife CIs |

All aggregates are k≥5 suppressed at export. POI footfall uses visitor-only
rows (home ≥400 m from venue).

The advanced insight runners depend on the enriched warehouse tables built by
the analytics pipeline (including segment, SES, purpose, weighting, and
optional OSRM routing stages). By default the CLI uses `data/veraset.duckdb`,
then falls back to the sibling `VectorMobility MVP/data/veraset.duckdb`; set
`WAREHOUSE_PATH` to override it.

## Guardrails

- No per-device trajectories in the UI
- Prefer SDK/app feed for hourly axes (agg has a UTC-midnight step ≈ 08:00 SGT)
- Map OD arcs remain straight-line; routing insights report road-network metrics

## Commands

```bash
python3 -m analytics export                 # all artifacts
python3 -m analytics export --only hex od   # subset
python3 -m analytics insights               # refresh all insight payloads
python3 -m analytics insights --only dining retail routing
python3 -m analytics sql "SELECT count(*) FROM trips"
python3 -m analytics profile
```
