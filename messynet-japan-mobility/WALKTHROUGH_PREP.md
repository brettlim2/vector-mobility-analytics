# Walkthrough prep — Japan mobility use cases

**Date:** 2026-10-14 · **Target:** `http://localhost:5179` (`npm run dev`), both tabs, EN and JA
**Method:** three passes. (1) Every number on the page checked against the others. (2) The method checked against how the real panel behaves, using the published events demo as the benchmark. (3) A client read-through, plus mobile, static-build and broken-data checks. Everything found was fixed and re-tested the same session.

## The one thing to know before you walk in

The first version oversold. Its retail data was a lucky draw with a noise floor of ±4%. The real events demo reports noise floors of **±38% (Odaiba) and ±65% (Makuhari)** on eight days of data. After rebuilding the retail data as a proper simulation and running it 150 times, the honest picture at an assumed 2,000 panel devices a day is:

| Question | Before the stress test | Now |
|---|---|---|
| SNS → foot traffic | "Yes, +14.7% ±4.3%" | **Yes**, +14.3% against a ±8.9% noise floor, so the true lift is somewhere between +5% and +23% |
| Primary vs secondary revenue | "Yes at zone level" | **Visible, not yet proven.** The path shows up; one campaign week cannot separate the spillover from noise |
| Movement × reported revenue | "Yes, r 0.87–0.95" | **Yes, with limits.** Strong across zones; day to day most of the correlation is just busy days |
| Nationality by country code | "Partly, 45%" | Same answer, with two more caveats (travel eSIMs leak into hub countries; handset OS matters) |

The page now says this itself. The answers are weaker and much harder to knock over.

## Pass 1 — do the numbers agree with each other?

**6 defects found, 6 fixed.**

| # | Severity | Defect | Fix |
|---|---|---|---|
| 1 | High | Listed transitions into a zone exceeded that zone's follow-on visits (confectionery: 19,893 in, 7,828 follow-on visits). The flows could not have happened. | Retail data is now one session-level simulation. Visits, first stops, transitions and attribution are all counted from the same walks. Inflow equals follow-on visits for all 8 zones. |
| 2 | High | KPI tiles said 61% of terminal devices shop and 1.9 zones per session. The zone data implied 47% and 1.78. | Both are computed from the simulation: 47% and 1.69. |
| 3 | High | Day-to-day noise (4.3%) was below what sample size alone allows (6.2%). The noise floor was impossibly tight. | Noise now comes from sampling plus a 6% daily drift. Floor went from ±4.3% to ±8.9%. |
| 4 | Medium | Secondary leg showed 97 extra visits arriving from the promoted zone but only 68 extra visits in the neighbour zone in total. | Now 43 and 40, from the same walks. |
| 5 | Medium | "Terminal devices 108,727" was daily counts times a made-up 0.83 dedupe factor. | Relabelled as device-days (61,717) with the per-day figure; no dedupe claimed. |
| 6 | Low | "Silver Week lifts the terminal by ~40%" was typed in, not measured. The footnote on the next-stop chart quoted a different metric from the chart. | Both read from the data (45%; 30.8 → 31.6 per 100). |

## Pass 2 — would the method survive the engineer?

**5 defects found, 5 fixed.**

| # | Severity | Defect | Fix |
|---|---|---|---|
| 7 | High | The page showed one random draw, and it was a favourable one (secondary "detected"). | 150-seed study run. Default seed is the median-noise draw, stated in the generator. Verdict wording switches on whether each effect clears its noise floor. |
| 8 | High | Tenant revenue was generated directly from panel visits, so the visits-to-revenue correlation was circular. | Revenue is driven by a separate, larger simulated population the panel only samples. The page shows raw r (0.73–0.86) next to traffic-adjusted r (0.12–0.60). |
| 9 | Medium | "Travel eSIM" was shown as a class the panel can see. A travel eSIM looks like ordinary foreign roaming. | Relabelled as "known travel-eSIM operator, market ambiguous" (an operator-list heuristic), with the note that some leak into the issuing country. |
| 10 | Medium | Entry airport was marked a clean "Yes". Phones first seen after leaving the airport have no entry point. | Marked partial; cohort definition says so. |
| 11 | Medium | Lag of "1 day" presented as a finding. In the 40-seed runs the true 1-day lag was picked only 62% of the time at this density. | Caption now says neighbouring lags score nearly as high and this is not a dependable lag. |

### Detection power (40 simulated runs per density, true primary lift ≈ +16%, true spillover ≈ +8%)

| Panel devices / day in terminal | Noise floor (median) | Primary lift detected | Measured lift ranged | Spillover detected | Control zone false alarm |
|---|---|---|---|---|---|
| 500 | ±16% | 55% | −0% to +34% | 15% | 2% |
| 1,000 | ±12% | 75% | 0% to +30% | 7% | 10% |
| 2,000 | ±9% | 90% | +2% to +31% | 25% | 12% |
| 4,000 | ±7% | 97% | +6% to +23% | 22% | 7% |

What to take from it:
- **Primary lift is measurable** if the terminal holds about 2,000 panel devices a day and the campaign moves the zone by 15% or more.
- **Spillover is not provable from one campaign week at any density tested.** It needs several campaigns pooled, or a venue-side signal.
- **More devices stop helping past about 2,000 a day.** Day-to-day drift sets the floor. More baseline weeks help more.
- The control zone trips the detector 7–12% of the time, above the nominal 5%, because the noise floor is estimated from only 18 quiet days.

These depend on my assumed 6% daily drift. Real drift could be higher; the reference's ±38% suggests it may be.

## Pass 3 — client read, and does it hold up on screen?

**4 defects found, 4 fixed.** Checked and passed: both tabs in EN and JA with no blank, NaN or undefined values; static build served from a sub-path (as GitHub Pages would); no horizontal overflow at phone width; generator re-runs byte-identical.

| # | Severity | Defect | Fix |
|---|---|---|---|
| 12 | High (credibility) | Route table showed South Korea → Hiroshima as 100% indirect, because Hiroshima was not modelled as an entry airport. An airline client knows better. | Hiroshima added as an entry airport for nearby markets. Korea → Hiroshima is now 74% indirect; US → Hiroshima stays 100%. |
| 13 | Medium | A data file with one zone missing blanked the entire page. Swapping in a real export live would have done this. | Each readout now shows a "does not match the expected shape" notice with the error; a missing file shows "not loaded". The synthetic-data notice stays visible in both cases. |
| 14 | Low | Phone width: chart title squeezed into a one-word-per-line column beside the toggle. | Header wraps. |
| 15 | Low | Flow map: Osaka and Fukuoka labels overlapped. | Labels repositioned. |

## Pass 4 — would a client understand it? (language, UX, UI)

Measured on the retail page before and after.

| Check | Before | After |
|---|---|---|
| Text at 11px or smaller | 79% | 0% (smallest is 12px, body 13.5–14.5px) |
| Text below 4.5:1 contrast | 18% | 0% |
| "MDE", "noise floor", "panel", "lift", "baseline", "modelled", "traffic-adjusted", "session", "difference-in-differences" | 72 uses | 0 |
| "block" | 64 uses | 0 (now "zone", with short names such as "Fashion (2F)") |
| Verdict answers | one 64–77 word paragraph each | one bold sentence, then the detail |
| Labels cut off with "…" | 16 | 0 (they wrap) |
| Airline page: "cohort", "gateway", "indirect", "roaming", "market", "devices" | 60+ uses | 0 |

**11 defects found, 11 fixed.**

| # | Defect | Fix |
|---|---|---|
| 16 | No headline answer: a client had to read a paragraph of numbers to find "yes" or "no". | Each question now has a badge (Yes / Partly), one bold plain sentence, then the supporting detail. The questions are quoted in the client's own wording. |
| 17 | Analyst vocabulary throughout. | Rewritten in the client's words in both languages. See the glossary below. |
| 18 | Small, low-contrast, all-caps micro-labels. | Larger sizes, sentence case, lighter grey for all text that carries meaning. |
| 19 | The "synthetic" notice was one small grey badge. | A callout at the top of every page: "Sample data: this page shows what your report would look like". |
| 20 | Nothing explained what a "visit" or "±9%" means. | A fold-out "How to read these numbers" under the notice, four plain definitions. |
| 21 | The sticky section bar sat 13px under the header and overlapped it on phones. | It tracks the real header height, and is not sticky on narrow screens. |
| 22 | Clicking a country in the arrival table changed a map further down, off screen. Nothing appeared to happen. | The page scrolls to the map. Country names are underlined so they read as links. |
| 23 | The scatter chart had overlapping labels and needed chart-reading skill. | Replaced by two bars per zone: share of visits next to share of sales. |
| 24 | The store table showed a repeated correlation figure (0.73 / 0.60) per row. | Now two columns side by side: visits to the store's zone and the store's sales, campaign week versus normal. |
| 25 | Airport codes (NRT, CTS) in tiles, itineraries and the route table; "Chubu / Hokuriku (Chubu)". | Airport names everywhere except the compact arrival table, which keeps codes with a key underneath. |
| 26 | Mixed money units (¥952K next to ¥4.14M), hyphens for minus signs, a zoomed chart axis with no warning. | One unit (¥0.95M), true minus signs, and a note that the vertical scale is zoomed in. |

### Page wording ↔ engineer wording

| The page says | The engineer means |
|---|---|
| zone | block / indoor polygon |
| phones in our sample | panel devices |
| we can detect changes from ±9% | MDE / noise floor |
| clear change · too small to call | detected · within noise |
| normal week | traffic-adjusted baseline |
| comparison zone | control |
| direct · follow-on sales | primary · secondary contribution |
| estimated from extra visits | modelled revenue |
| home country | SIM country code (MCC), market |
| landed elsewhere first | indirect arrival |
| the region's airport | gateway |
| visitors in the sample | inbound cohort |

Still open on this pass: the Japanese was rewritten to the same plain register by me and has not had a native review, and charts on a phone scroll sideways rather than reflow.

## If you are playing the client

**Airport retail**

| They ask | Answer |
|---|---|
| "So did the campaign work?" | Footfall into the promoted zone rose about 14%, give or take 9. That clears the noise floor. The control zone did not move. |
| "How much revenue did it make?" | The panel does not see tills. Your tenant's sales in that zone ran ¥2.96M above the traffic-adjusted baseline in campaign week. The footfall model predicts ¥4.14M. Same direction and order of magnitude, not the same number. |
| "Did Mango benefit from Zara's promotion?" | Two answers. If they are in different zones, we can see people walking from one to the other, but one week is too short to prove the extra. If they are side by side, the panel cannot tell them apart; that needs your Wi-Fi/BLE logs or receipt data. |
| "Why is the secondary number so vague?" | The neighbour zone's lift was +4.9% against a ±8.1% noise floor. Pooling three or four campaigns would settle it. |
| "What do you need from us?" | Daily sales per tenant, a tenant-to-zone map, zone outlines per floor, the campaign calendar, and at least four baseline weeks. |
| "Is Silver Week distorting this?" | No. Every lift is a share of terminal traffic, so the whole-terminal swing cancels. Toggle the chart to "Number of phones" to show the two peaks, then back. |
| "Are these our numbers?" | No. Everything on screen is synthetic. The layout and method are real; the figures are placeholders. |
| "Can you track individual shoppers?" | The readouts are aggregates only. What consent the panel rests on and what minimum group size applies is a question for the engineer; I have not verified it. |

**Airline**

| They ask | Answer |
|---|---|
| "Can you tell us nationality?" | For devices roaming on a home SIM, yes. In this mock-up that is 45% of the inbound cohort; the real rate is unknown until the engine reports it. |
| "So Taiwan is 20% of arrivals?" | No. Those bars are identified devices, not arrival shares. Markets differ in how much they roam, so the sample is re-weighted against official arrivals. |
| "Should we fly Taipei–Sapporo?" | The panel shows about half of Taiwanese visitors to Hokkaido landed somewhere else first, mostly Narita. That is a demand signal. It says nothing about fares, slots, existing capacity or Japanese travellers going the other way. |
| "Which city in Taiwan? Which airline did they fly?" | Not observable. The country code gives a market, and the panel starts at the arrival airport. That needs your booking or O&D data joined at market level. |
| "Why is Kansai at the top of the route table?" | Tokyo arrivals touring Kyoto and Osaka. That is the golden route, already well served. The interesting rows are regions reached mainly by onward domestic travel. |
| "Is one month enough?" | No. Hokkaido in September is not Hokkaido in February. A route case needs a full year. |

## If you are playing the engineer

| Challenge | Where the build stands |
|---|---|
| "Our real MDE was ±38% and ±65%. Yours is ±9%." | Agreed that the real number will likely be worse than mine. Mine uses a same-building denominator, 9 baseline days and an assumed 6% daily drift; the reference used national DAU, 8 days and 3 placebo windows. The simulation is a floor, not a forecast. |
| "How many panel devices are actually in New Chitose per day?" | Unknown. I assumed 2,000 from the 1,700–2,600 a day the reference shows at Makuhari and Odaiba. This is the first number to get; the power table shows what each level buys. |
| "We have eight days of data. You assume 28, plus a 30-day look-back." | Correct, and the design depends on it. With eight days there is no usable baseline for a one-week campaign. |
| "Your r is just traffic." | Yes for the raw figure. The page shows the traffic-adjusted r beside it, and it is weak (0.12–0.60) at this density. |
| "Your MDE treats days as independent." | It does. Daily shares are autocorrelated, so the true floor is wider. Control false alarms at 7–12% show the same thing. A placebo-window or block-bootstrap floor would be more honest. |
| "Lag correlation on one pulse is meaningless." | Close to it. One campaign gives one rise and one fall. The page says so. |
| "Can the SDK even read the SIM's country?" | The reference repo carries nationality fields ("roaming / foreign-carrier devices only"), so some signal exists. My understanding is that recent iOS versions no longer expose carrier details to apps, which would make this Android-only and skew it by market. **Not verified; ask.** |
| "How do you separate a travel eSIM from real roaming?" | You cannot directly. The page treats it as a maintained list of wholesale operators and admits leakage. Whether such a list exists is an open question. |
| "Indoor GPS will not give you 30–50 m zones, and 2F and 3F overlap." | The zones are my assumption about defensible resolution, not a tested limit. If the real answer is "terminal wing" rather than "zone", the retail tab collapses to the footfall-lift question only. |
| "How do you know a device is a shopper and not staff?" | Not handled. Staff and crew would need filtering by repeat presence. |
| "Do your JSON shapes match the engine's exports?" | Loosely. I followed the type definitions in the public repo and added SNS, attribution and route zones. A mismatch now shows a notice instead of a blank page. |

## Things I could not verify — ask the engineer

1. Panel devices per day inside New Chitose, and inside its retail floors.
2. Achievable indoor resolution, and whether floors can be separated.
3. How many days of data exist, and whether a 30-day look-back is possible.
4. Real carrier/SIM-country coverage among inbound devices, by handset OS.
5. Whether a travel-eSIM operator list exists.
6. Share of inbound devices first seen at the arrival airport rather than later.
7. Consent basis and minimum cell size for aggregated outputs.
8. Whether the engine's retail and tourism exports (referenced in the public repo, not published) already exist for these venues.
9. The Japanese copy has not been reviewed by a native speaker.

## Suggested running order

Each report now opens with a CEO-level story on the first screen: one headline, three numbered findings (number, small picture, "so what"), and three next steps. Everything below is the evidence, and each finding links down to its own.

1. Retail, first screen only. Read the headline, then the three findings left to right. Stop here if the room only wants the answer.
2. "See the evidence" on finding 1 → the trend chart. Point at the grey normal-range band and the campaign-week line above it. Flip to "Number of phones" and back to show why the percentage view matters.
3. "Is the change real?": each dot with its error bar; only Fashion clears the zero line.
4. The floor map: Fashion moved, Lifestyle & goods rose but is too small to call, everything else flat.
5. Sales: estimated versus reported, then the store table read across a row.
6. "What we need from you".
7. Airlines tab, first screen. Then "Where they go": click Taiwan and the Narita/Haneda → Hokkaido routes light up. Then the Taiwan → Hokkaido row under "Route ideas".
8. Close on the open questions above.

**Daylight / Dark.** Daylight (the website's look) is the default; the switch top right brings back the original dark style. On Daylight there is exactly one volt mark per page, the dot after the headline, per the brand rule; emphasis in charts is deep teal instead.

## Reproduce

```bash
npm run data                                   # regenerate (deterministic)
PANEL=1000 DRY=1 node scripts/generate-data.mjs  # same campaign at another panel density, no files written
SEED=7 DRY=1 node scripts/generate-data.mjs      # another random draw
```
