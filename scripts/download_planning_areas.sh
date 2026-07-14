#!/usr/bin/env bash
# Download URA Master Plan 2025 Planning Area Boundary (No Sea) GeoJSON.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/data/boundaries/planning_areas.geojson"
mkdir -p "$(dirname "$DEST")"
META=$(curl -sL -A "Mozilla/5.0" \
  "https://api-open.data.gov.sg/v1/public/api/datasets/d_2cc750190544007400b2cfd5d7f53209/poll-download")
URL=$(python3 -c "import json,sys; print(json.load(sys.stdin)['data']['url'])" <<<"$META")
curl -sL -A "Mozilla/5.0" "$URL" -o "$DEST"
echo "Wrote $DEST ($(wc -c < "$DEST") bytes)"
