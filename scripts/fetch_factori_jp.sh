#!/usr/bin/env bash
# Fetch a sample of the Factori Japan mobility feed from GCS into data/factori_scratch/jp_raw/.
#
# The full partition (gs://factori-messynetwork/sample/mobility/year=2026/month=09/cntry=JPN/)
# is ~236 GiB across ~3,900 parquet parts. Parts are device-disjoint — each holds the complete
# ping history for ~155k unique devices — so a strided subset of parts is a clean random
# device sample with full trajectories, not a truncated slice. Defaults to 25 parts (~1.6 GiB).
#
# Prereqs: Google Cloud SDK (gcloud/gsutil) + the Factori read-only service-account key.
# Usage:
#   FACTORI_KEY=/path/to/service-account.json ./scripts/fetch_factori_jp.sh [NUM_PARTS]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/data/factori_scratch/jp_raw"
SRC="gs://factori-messynetwork/sample/mobility/year=2026/month=09/cntry=JPN"
NUM_PARTS="${1:-25}"
KEY="${FACTORI_KEY:?set FACTORI_KEY to the service-account JSON path}"

mkdir -p "$DEST"
echo "Activating service account..."
gcloud auth activate-service-account --key-file="$KEY" >/dev/null

echo "Listing parts and selecting a strided sample of $NUM_PARTS..."
MANIFEST="$(mktemp)"; SELECTED="$(mktemp)"
trap 'rm -f "$MANIFEST" "$SELECTED"' EXIT
gsutil ls "$SRC/" | grep '\.parquet$' > "$MANIFEST"
TOTAL=$(wc -l < "$MANIFEST")
STRIDE=$(( TOTAL / NUM_PARTS )); [ "$STRIDE" -lt 1 ] && STRIDE=1
awk -v s="$STRIDE" 'NR==1 || NR % s == 0' "$MANIFEST" | head -n "$NUM_PARTS" > "$SELECTED"
echo "  $TOTAL parts total; pulling $(wc -l < "$SELECTED") (stride $STRIDE)."

# shellcheck disable=SC2046
gsutil -m cp $(cat "$SELECTED") "$DEST/"
echo "Done. $(ls "$DEST"/*.parquet | wc -l) parts in $DEST ($(du -sh "$DEST" | cut -f1))."
