# Japan Mobility Analytics

Interactive geospatial analytics over **Factori** Japan mobility data
(DuckDB → static cubes → MapLibre + deck.gl). Hex density, inter-metro OD arcs,
prefecture boundaries, filter cubes, calendar heatmap, and warehouse insight
views for zone activity, movement, dwell, and burst events.

The pipeline is source-aware (`analytics.SOURCE`): `factori` (Factori Japan GCS
parquet, the default) or `veraset` (the original Singapore feed). Only the raw
ping-ingestion step (`engine.build_pings`) and a handful of geo constants differ;
everything downstream — stops, trips, hex rollups, exports, the frontend — is shared.

## Data source

Factori ships Japan mobility as partitioned parquet in a GCS bucket
(`gs://factori-messynetwork/sample/mobility/year=.../month=.../cntry=JPN/`).
Parts are device-disjoint, so a strided subset is a clean random device sample
with complete trajectories. Pull one with:

```bash
FACTORI_KEY=/path/to/service-account.json ./scripts/fetch_factori_jp.sh 25
```

Columns map to the engine's ping contract as: `maid`→device id, epoch
`timestamp`→`ts` (JST), `latitude`/`longitude`/`horizontal_accuracy` direct,
`country='JPN'`, plus precomputed `geohash`/`hex8`/`hex9` and `state_hasc`/`city_hasc`.
Raw parquet, the DuckDB warehouse, and the service-account key are git-ignored —
never commit them.

> Note: analyses that need POI (Overture) or Japan census/boundary enrichment
> (dining, retail, SES, segments, purpose, weighted, affinity, urban context) are
> not produced in the default Japan build; the pipeline skips them cleanly and the
> UI hides the sections that have no data.

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
# 1. Python deps (duckdb, h3) + the Factori Japan sample
pip3 install -r requirements.txt
FACTORI_KEY=/path/to/service-account.json ./scripts/fetch_factori_jp.sh 25

# 2. Build the warehouse from the raw parquet, run insights, export cubes
python3 -m analytics build        # pings → devices → stops → trips → zones
python3 -m analytics insights
python3 -m analytics export       # map layers + cubes → public/data/

# 3. Run the UI
npm install
npm run dev
```

Prefecture boundaries ship at `data/boundaries/japan_prefectures.geojson`
(dataofjapan/land, simplified); the export copies them to `public/data/`.

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
| `planning_areas.geojson` | Japan prefecture boundaries (Factori build) |
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

All aggregates are k≥5 suppressed at export; no per-device trajectories leave
the warehouse. The POI/SES/census-derived artifacts (`cube_visits`,
`poi_insights`, `dining`, `retail`, `ses`, `segments`, `purpose`, `urban_context`,
`weighted`, `affinity`, `uncertainty`) require Overture + Japan census enrichment
and are absent from the default Japan build.

The warehouse DB defaults to `data/factori_jp.duckdb` (`factori` source) or
`data/veraset.duckdb` (`veraset`); set `WAREHOUSE_PATH` to override. Select the
source with `MOBILITY_SOURCE=factori|veraset`.

## Japan use-case readouts (separate app)

The MessyNet Japan readouts — **New Chitose Airport × Retail** and **domestic tourism** —
live in their own repo: **https://github.com/brettlim2/messynet-japan-mobility**. Their
data is generated from this warehouse by:

- `analytics/jp_retail.py` → `jp_retail_readout.json` (needs the New Chitose airport extract
  from `scripts/extract_factori_airport.py`)
- `analytics/jp_tourism.py` → `jp_tourism_readout.json` (domestic flows from the warehouse)

Set `MESSYNET_APP_DIR` to a checkout of that repo and run the exporters to refresh its
`public/data/`. Mobility is real; revenue is modelled; the SNS block is synthetic.

## Guardrails

- No per-device trajectories in the UI
- All timestamps are JST (UTC+9) for the Japan build
- Map OD arcs are straight-line between zone centroids

## Commands

```bash
python3 -m analytics export                 # all artifacts
python3 -m analytics export --only hex od   # subset
python3 -m analytics insights               # refresh all insight payloads
python3 -m analytics insights --only dining retail routing
python3 -m analytics sql "SELECT count(*) FROM trips"
python3 -m analytics profile
```
