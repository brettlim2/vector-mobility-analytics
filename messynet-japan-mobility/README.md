# MessyMobility · Japan use cases (illustrative)

Two readouts in the format of [messymobility-jp-events](https://github.com/brettlim2/messymobility-jp-events),
re-pointed at two new briefs:

- **New Chitose Airport × Retail** — SNS brand engagement → footfall → revenue, primary vs
  secondary contribution, movement × tenant-reported revenue.
- **Airlines × Inbound tourism** — home market by mobile country code, entry airport →
  destinations, indirect demand as evidence for route evaluation.

**The mobility is real.** `public/data/*.json` is now generated from the **Factori Japan**
mobility panel (Sep 16–23 2026) by the exporters in the sibling `vector-mobility-analytics`
repo (`analytics/jp_retail.py`, `analytics/jp_tourism.py`):

- **Retail (New Chitose):** terminal footfall, dwell, sessions, the +43% Silver-Week uplift, and
  intra-terminal sub-zone footfall + transitions are real. Zone→tenant labels are illustrative
  (GPS resolves terminal areas, not shops); revenue is **modelled** (visits × assumed spend); the
  SNS `social` block is **synthetic**.
- **Tourism:** reframed from inbound to **domestic** — origin region, gateway→destination flows,
  itineraries, nights and route candidates are real. Inbound nationality is not supportable by this
  domestic resident panel.

`scripts/generate-data.mjs` remains as the original seeded-synthetic fallback (`npm run data`).
Derived metrics (lift, MDE, lag correlation, attribution, route ranking) are computed from the
series the usual way, so the pages work on either source as long as the `src/lib/types.ts` shape holds.

```bash
npm install
npm run data   # regenerate public/data/*.json
npm run dev    # http://localhost:5179  (?tab=retail|tourism&lang=en|ja)
npm run build  # static site in dist/, base './' for GitHub Pages
npm run demo   # one self-contained file: demo/messynet-japan-mobility.html (shareable, no server)
```

Retail figures come from one session-level simulation. `PANEL=<devices/day>` and `SEED=<n>` change the
assumed panel density and the random draw; `DRY=1` skips writing files. See `WALKTHROUGH_PREP.md` for the
stress-test findings and the detection-power table.

Stack matches the reference: Vite 6, React 19, Tailwind 4, inline-SVG charts, MessyNet
"Signal in the Dark" tokens, EN / JA toggle.

## Swapping in real data

| File | Replace with |
| --- | --- |
| `jp_retail_readout.json` | Engine retail-paths export per venue (zone footfall, zone transitions) + SNS daily counts + tenant-reported daily sales |
| `jp_tourism_readout.json` | Engine tourism export (inbound cohort, arrivals per airport, airport → destination, nationality by carrier) |

Shapes are documented in `src/lib/types.ts`.

Shareable demo (private until shared): https://claude.ai/artifact/BydnkJr7Fi3PiyEAaLkbWf — republish after `npm run demo`.
