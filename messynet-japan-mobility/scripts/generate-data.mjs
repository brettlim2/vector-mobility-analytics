// Synthetic data generator for the two use-case dashboards.
//
// Nothing here comes from the real Japan mobility panel. The numbers are seeded,
// deterministic, and shaped to look like what the analytics engine would emit
// (same JSON conventions as jp_event_readout.json in messymobility-jp-events).
// Every derived metric (lift, MDE, lag correlation, attribution, route ranking)
// is COMPUTED from the generated series the way an analyst would compute it from
// real data — not hard-coded — so swapping in real feeds keeps the dashboards honest.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
mkdirSync(OUT, { recursive: true })

// ---- seeded RNG ----
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// Default seed 59 is the median-noise draw out of 150 at PANEL=2000, chosen so the page shows a typical result, not a lucky one.
let rnd = mulberry32(+(process.env.SEED ?? 59))
const gauss = () => {
  const u = Math.max(rnd(), 1e-9), v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const round = (n, dp = 0) => { const k = 10 ** dp; return Math.round(n * k) / k }
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const sum = (a) => a.reduce((s, x) => s + x, 0)
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2)) * (a.length / Math.max(1, a.length - 1))) }
const pearson = (a, b) => {
  const ma = mean(a), mb = mean(b)
  let n = 0, da = 0, db = 0
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 }
  return da && db ? n / Math.sqrt(da * db) : 0
}

// ---- calendar: Sep 1–28 2026 ----
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOLIDAYS = {
  '2026-09-21': 'Respect for the Aged Day',
  '2026-09-22': "Citizens' Holiday",
  '2026-09-23': 'Autumnal Equinox',
}
const dates = Array.from({ length: 28 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
const dayTags = Object.fromEntries(dates.map((d) => {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
  const tag = { dow: DOW[dow], weekend: dow === 0 || dow === 6 }
  if (HOLIDAYS[d]) tag.holiday = HOLIDAYS[d]
  return [d, tag]
}))
const SILVER_WEEK = new Set(['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'])

// =====================================================================================
// 1. NEW CHITOSE AIRPORT × RETAIL
// =====================================================================================
// Every retail figure comes from ONE session-level simulation: each panel device that
// shops makes an ordered walk through retail blocks. Visits, first stops, transitions,
// continuation rates and attribution are all counted from those walks, so they reconcile.
const CAMPAIGN = dates.slice(9, 16) // Sep 10–16
const TAIL = dates.slice(16, 19) // decay days, excluded from the noise estimate
const campaignSet = new Set(CAMPAIGN)
const tailSet = new Set(TAIL)
const BASELINE = dates.slice(0, 9) // Sep 1–9

// ASSUMPTION: panel devices seen in the terminal per weekday. The published events demo
// shows roughly 1,700–2,600 panel devices/day at large venues; an airport is assumed similar.
// Override with PANEL=<n> to see how detection power changes (DRY=1 skips file writes).
const PANEL = +(process.env.PANEL ?? 2000)
const DRY = !!process.env.DRY
const POP_SCALE = 10 // a larger independent sample standing in for shoppers the panel never sees
const CONVERSION = 0.47 // share of terminal devices that make at least one retail stop
const DAY_EFFECT_SD = 0.06 // real-world day-to-day drift in block preference, beyond sampling noise

// Blocks are the resolution a GPS/SDK panel can defend indoors (~30–50 m).
// Layout is illustrative, not a survey of the real terminal.
// first = first-stop weight; next = P(next stop | current stop), remainder = leave retail.
const ZONES = [
  { id: 'fashion', label: { en: 'Fashion (2F)', ja: 'ファッション（2F）' }, first: 0.071, rpv: 32500, link: 0.9,
    next: { lifestyle: .30, confectionery: .24, sweets: .10, restaurants: .08, market: .06 } },
  { id: 'lifestyle', label: { en: 'Lifestyle & goods (2F)', ja: '雑貨・ライフスタイル（2F）' }, first: 0.054, rpv: 21600, link: 0.9,
    next: { confectionery: .26, fashion: .17, sweets: .08, restaurants: .07, market: .05 } },
  { id: 'confectionery', label: { en: 'Sweets & souvenirs (2F)', ja: '菓子・土産（2F）' }, first: 0.323, rpv: 46000, link: 0.92,
    next: { market: .13, sweets: .10, restaurants: .08, ramen: .07, fashion: .045, lifestyle: .035 } },
  { id: 'market', label: { en: 'Seafood market (2F)', ja: '海産マーケット（2F）' }, first: 0.086, rpv: 51000, link: 0.85,
    next: { confectionery: .30, restaurants: .08, sweets: .06, ramen: .06 } },
  { id: 'ramen', label: { en: 'Ramen street (3F)', ja: 'ラーメン街（3F）' }, first: 0.147, rpv: 27300, link: 0.93,
    next: { confectionery: .30, sweets: .08, market: .05, fashion: .03 } },
  { id: 'sweets', label: { en: 'Character & desserts (3F)', ja: 'キャラクター・スイーツ（3F）' }, first: 0.081, rpv: 24000, link: 0.88,
    next: { confectionery: .20, ramen: .15, restaurants: .08, fashion: .03 } },
  { id: 'restaurants', label: { en: 'Restaurants (3F)', ja: 'レストラン（3F）' }, first: 0.180, rpv: 37400, link: 0.9,
    next: { confectionery: .28, sweets: .07, market: .05, fashion: .03, lifestyle: .02 } },
  { id: 'dutyfree', label: { en: 'Duty-free (international)', ja: '免税店（国際線）' }, first: 0.058, rpv: 126000, link: 0.25,
    next: { confectionery: .06, restaurants: .03 } },
]
const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]))
const PROMO = 'fashion', NEIGHBOUR = 'lifestyle', CONTROL = 'restaurants'

// terminal traffic: weekday base, weekend + Silver Week uplift
const terminal = dates.map((d) => {
  const t = dayTags[d]
  return Math.round(PANEL * (t.weekend ? 1.14 : 1) * (SILVER_WEEK.has(d) ? 1.38 : 1) * (1 + 0.03 * gauss()))
})

// SNS post volume about the promoted brand × airport
const campaignCurve = [58, 131, 142, 96, 74, 61, 49]
const tailCurve = [31, 19, 13]
const posts = dates.map((d) => {
  const ci = CAMPAIGN.indexOf(d), ti = TAIL.indexOf(d)
  const base = ci >= 0 ? campaignCurve[ci] : ti >= 0 ? tailCurve[ti] : 6 + rnd() * 8
  return Math.max(1, Math.round(base * (1 + 0.08 * gauss())))
})
const engagement = posts.map((p, i) => Math.round(p * (38 + 30 * rnd()) * (campaignSet.has(dates[i]) ? 1.6 : 1)))

// hidden ground truth: yesterday's excess posts bring extra shoppers who START in the promoted block
const excess = posts.map((p) => Math.max(0, p - 10))
const extraPerDay = dates.map((_, i) => (i === 0 ? 0 : 0.27 * excess[i - 1] * (PANEL / 2000)))
const convFx = dates.map(() => 1 + 0.02 * gauss())
const dayFx = dates.map(() => Object.fromEntries(ZONES.map((z) => [z.id, Math.exp(DAY_EFFECT_SD * gauss())])))

function walk(first) {
  const seq = [first]
  while (seq.length < 4) {
    let r = rnd(), nxt = null
    for (const [to, p] of Object.entries(ZONE[seq[seq.length - 1]].next)) { r -= p; if (r <= 0) { nxt = to; break } }
    if (!nxt || seq.includes(nxt)) break
    seq.push(nxt)
  }
  return seq
}
function simulateDay(i, scale) {
  const c = { visitors: {}, primary: {}, inc: {}, trans: {}, promoFirst: 0, promoNext: {} }
  for (const z of ZONES) { c.visitors[z.id] = 0; c.primary[z.id] = 0; c.inc[z.id] = 0 }
  const weights = ZONES.map((z) => [z.id, z.first * dayFx[i][z.id]])
  const wTotal = sum(weights.map((w) => w[1]))
  const nBase = Math.round(terminal[i] * scale * CONVERSION * convFx[i])
  const lam = extraPerDay[i] * scale
  const nExtra = Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss()))
  for (let k = 0; k < nBase + nExtra; k++) {
    const isExtra = k >= nBase
    let first = PROMO
    if (!isExtra) { let r = rnd() * wTotal; for (const [id, w] of weights) { r -= w; if (r <= 0) { first = id; break } } }
    const seq = walk(first)
    c.primary[seq[0]]++
    seq.forEach((z, j) => {
      c.visitors[z]++
      if (isExtra) c.inc[z]++
      if (j > 0) { const key = `${seq[j - 1]}>${z}`; c.trans[key] = (c.trans[key] ?? 0) + 1 }
    })
    if (seq[0] === PROMO) { c.promoFirst++; if (seq[1]) c.promoNext[seq[1]] = (c.promoNext[seq[1]] ?? 0) + 1 }
  }
  return c
}
const panelDays = dates.map((_, i) => simulateDay(i, 1))
const popDays = dates.map((_, i) => simulateDay(i, POP_SCALE)) // drives tenant sales; the panel only samples it

const zoneDaily = {}
for (const z of ZONES) {
  const popVisits = popDays.map((q) => q.visitors[z.id] / POP_SCALE)
  const flat = mean(popVisits) * z.rpv
  zoneDaily[z.id] = dates.map((_, i) => {
    const p = panelDays[i]
    // reported revenue: partly visit-driven (z.link), partly basket noise the panel cannot see
    const revenue = Math.round((z.link * popVisits[i] * z.rpv + (1 - z.link) * flat) * (1 + (z.id === 'dutyfree' ? 0.2 : 0.08) * gauss()))
    const incRevenue = Math.min(revenue, z.link * (popDays[i].inc[z.id] / POP_SCALE) * z.rpv)
    return { visitors: p.visitors[z.id], primary: p.primary[z.id], secondary: p.visitors[z.id] - p.primary[z.id], revenue, incRevenue, share: p.visitors[z.id] / terminal[i] }
  })
}
const promoToNeighbour = panelDays.map((p) => p.trans[`${PROMO}>${NEIGHBOUR}`] ?? 0)

const idx = (set) => dates.map((d, i) => (set.includes(d) ? i : -1)).filter((i) => i >= 0)
const iBase = idx(BASELINE), iCamp = idx(CAMPAIGN)
const iQuiet = dates.map((d, i) => (!campaignSet.has(d) && !tailSet.has(d) ? i : -1)).filter((i) => i >= 0)

// analyst-style normalization: share of terminal devices, campaign vs baseline, MDE from quiet days
function normalize(zoneId) {
  const s = zoneDaily[zoneId].map((x) => x.share * 100)
  const base = mean(iBase.map((i) => s[i])), during = mean(iCamp.map((i) => s[i]))
  const noise = sd(iQuiet.map((i) => s[i]))
  const mde = 1.96 * noise * Math.sqrt(1 / iCamp.length + 1 / iBase.length)
  const effect = during - base
  return {
    basis: 'terminal_share',
    during_dates: CAMPAIGN,
    baseline_dates: BASELINE,
    during_share_pct: round(during, 2),
    baseline_share_pct: round(base, 2),
    effect_pts: round(effect, 2),
    relative_pct: round((effect / base) * 100, 1),
    noise_sd_pts: round(noise, 2),
    quiet_days: iQuiet.length,
    mde_pts: round(mde, 2),
    mde_relative_pct: round((mde / base) * 100, 1),
    detected: Math.abs(effect) > mde,
    series: Object.fromEntries(dates.map((d, i) => [d, round(s[i], 2)])),
  }
}
const normPromo = normalize(PROMO), normNeighbour = normalize(NEIGHBOUR), normControl = normalize(CONTROL)

// lagged correlation: posts on day d-lag vs promoted-block share on day d
const promoShare = zoneDaily[PROMO].map((x) => x.share * 100)
const lagCorr = [0, 1, 2, 3, 4].map((lag) => {
  const a = [], b = []
  for (let i = lag; i < dates.length; i++) { a.push(posts[i - lag]); b.push(promoShare[i]) }
  return { lag_days: lag, pearson_r: round(pearson(a, b), 2), n_days: a.length }
})
const bestLag = lagCorr.reduce((p, c) => (c.pearson_r > p.pearson_r ? c : p))

// ---- attribution: primary (promoted block) + secondary (spillover to neighbour) ----
function attribution() {
  const P = zoneDaily[PROMO], N = zoneDaily[NEIGHBOUR]
  const perTerminal = (arr, ii) => sum(ii.map((i) => arr[i])) / sum(ii.map((i) => terminal[i]))
  // expected = baseline rate × campaign-day terminal traffic; incremental = observed − expected
  const incOver = (arr) => {
    const rate = perTerminal(arr, iBase)
    return sum(iCamp.map((i) => arr[i] - rate * terminal[i]))
  }
  const rpvBase = (Z) => sum(iBase.map((i) => Z[i].revenue)) / sum(iBase.map((i) => Z[i].visitors))
  const incPromoVisits = incOver(P.map((x) => x.visitors))
  const incSpillVisits = incOver(promoToNeighbour)
  const rpvP = rpvBase(P), rpvN = rpvBase(N)
  return {
    campaign_days: CAMPAIGN.length,
    primary: {
      zone: PROMO,
      incremental_first_stop_visits: Math.round(incOver(P.map((x) => x.primary))),
      incremental_visits: Math.round(incPromoVisits),
      revenue_per_panel_visit: Math.round(rpvP),
      modelled_revenue: Math.round(incPromoVisits * rpvP),
      reported_revenue_uplift: Math.round(incOver(P.map((x) => x.revenue))),
    },
    secondary: {
      zone: NEIGHBOUR,
      incremental_visits_from_promoted: Math.round(incSpillVisits),
      incremental_visits: Math.round(incOver(N.map((x) => x.visitors))),
      revenue_per_panel_visit: Math.round(rpvN),
      modelled_revenue: Math.round(incSpillVisits * rpvN),
      reported_revenue_uplift: Math.round(incOver(N.map((x) => x.revenue))),
    },
    transition_per_day: { baseline: round(mean(iBase.map((i) => promoToNeighbour[i])), 1), campaign: round(mean(iCamp.map((i) => promoToNeighbour[i])), 1) },
    continuation_rate: {
      baseline: round(sum(iBase.map((i) => promoToNeighbour[i])) / sum(iBase.map((i) => P[i].visitors)), 3),
      campaign: round(sum(iCamp.map((i) => promoToNeighbour[i])) / sum(iCamp.map((i) => P[i].visitors)), 3),
    },
  }
}

// ---- block summary + revenue correlation ----
const zoneSummary = ZONES.map((z) => {
  const D = zoneDaily[z.id]
  const v = D.map((x) => x.visitors), r = D.map((x) => x.revenue)
  const perDay = (ii, arr) => mean(ii.map((i) => arr[i]))
  const sharePct = (ii) => (sum(ii.map((i) => v[i])) / sum(ii.map((i) => terminal[i]))) * 100
  return {
    zone: z.id,
    label: z.label,
    visitors: sum(v),
    primary: sum(D.map((x) => x.primary)),
    secondary: sum(D.map((x) => x.secondary)),
    primary_share: round(sum(D.map((x) => x.primary)) / sum(v), 3),
    reported_revenue: sum(r),
    revenue_per_panel_visit: Math.round(sum(r) / sum(v)),
    // raw: both series rise on busy days. adjusted: per terminal device, so shared traffic is removed.
    daily_visit_revenue_r: round(pearson(v, r), 2),
    daily_visit_revenue_r_adjusted: round(pearson(v.map((x, i) => x / terminal[i]), r.map((x, i) => x / terminal[i])), 2),
    visitors_per_day: { baseline: Math.round(perDay(iBase, v)), campaign: Math.round(perDay(iCamp, v)) },
    share_pct: { baseline: round(sharePct(iBase), 2), campaign: round(sharePct(iCamp), 2) },
  }
})
const crossZoneR = round(pearson(zoneSummary.map((z) => z.visitors), zoneSummary.map((z) => z.reported_revenue)), 2)
const crossZoneRExDutyFree = (() => {
  const zz = zoneSummary.filter((z) => z.zone !== 'dutyfree')
  return round(pearson(zz.map((z) => z.visitors), zz.map((z) => z.reported_revenue)), 2)
})()

// ---- tenants (store-level revenue is CLIENT-REPORTED; the panel only sees the block) ----
const STORES = [
  { id: 'fashion_a', zone: 'fashion', share: 0.46, label: { en: 'Fashion A · the campaign brand', ja: 'ファッションA（施策ブランド）' }, promoted: true },
  { id: 'fashion_c', zone: 'fashion', share: 0.31, label: { en: 'Fashion C · outdoor wear', ja: 'ファッションC（アウトドア）' } },
  { id: 'fashion_d', zone: 'fashion', share: 0.23, label: { en: 'Fashion D · accessories', ja: 'ファッションD（アクセサリー）' } },
  { id: 'fashion_b', zone: 'lifestyle', share: 0.38, label: { en: 'Fashion B · next door', ja: 'ファッションB（隣のエリア）' }, neighbour: true },
  { id: 'goods_a', zone: 'lifestyle', share: 0.35, label: { en: 'Lifestyle goods A', ja: '生活雑貨A' } },
  { id: 'goods_b', zone: 'lifestyle', share: 0.27, label: { en: 'Travel goods B', ja: 'トラベル用品B' } },
  { id: 'conf_a', zone: 'confectionery', share: 0.41, label: { en: 'Sweets flagship A', ja: '菓子旗艦店A' } },
  { id: 'conf_b', zone: 'confectionery', share: 0.34, label: { en: 'Chocolate & dairy B', ja: 'チョコレート・乳製品B' } },
  { id: 'conf_c', zone: 'confectionery', share: 0.25, label: { en: 'Regional souvenirs C', ja: '地域土産C' } },
  { id: 'market_a', zone: 'market', share: 1, label: { en: 'Seafood market (4 tenants)', ja: '海産マーケット（4店）' } },
  { id: 'ramen_a', zone: 'ramen', share: 1, label: { en: 'Ramen street (10 tenants)', ja: 'ラーメン街（10店）' } },
  { id: 'sweets_a', zone: 'sweets', share: 1, label: { en: 'Character & desserts (7 tenants)', ja: 'キャラクター・スイーツ（7店）' } },
  { id: 'rest_a', zone: 'restaurants', share: 1, label: { en: 'Restaurants (12 tenants)', ja: 'レストラン（12店）' } },
  { id: 'df_a', zone: 'dutyfree', share: 1, label: { en: 'Duty-free (3 tenants)', ja: '免税店（3店）' } },
]
const storeRows = STORES.map((s) => {
  const D = zoneDaily[s.zone]
  // campaign-driven revenue lands mostly with the promoted / neighbour brand; the rest of the block shares the remainder
  const incShare = s.promoted ? 0.88 : s.neighbour ? 0.8 : s.zone === PROMO ? 0.06 : s.zone === NEIGHBOUR ? 0.1 : s.share
  const daily = D.map((x) => ((x.revenue - x.incRevenue) * s.share + x.incRevenue * incShare) * (1 + 0.03 * gauss()))
  const perTerm = (ii) => sum(ii.map((i) => daily[i])) / sum(ii.map((i) => terminal[i]))
  return {
    store: s.id, label: s.label, zone: s.zone,
    promoted: !!s.promoted, neighbour: !!s.neighbour,
    reported_revenue: Math.round(sum(daily)),
    revenue_per_day: { baseline: Math.round(mean(iBase.map((i) => daily[i]))), campaign: Math.round(mean(iCamp.map((i) => daily[i]))) },
    // traffic-adjusted: revenue per terminal device, campaign vs baseline
    traffic_adjusted_change_pct: round((perTerm(iCamp) / perTerm(iBase) - 1) * 100, 1),
  }
})

// ---- block → block transitions over the whole window (counted from the same walks) ----
const transTotals = {}
for (const p of panelDays) for (const [k, n] of Object.entries(p.trans)) transTotals[k] = (transTotals[k] ?? 0) + n
const transitions = Object.entries(transTotals).map(([k, n]) => { const [from, to] = k.split('>'); return { from, to, n } }).sort((a, b) => b.n - a.n)

// where promoted-block first-stoppers go next: baseline vs campaign (per 100 first-stoppers)
const nextRate = (ii, zone) => (sum(ii.map((i) => panelDays[i].promoNext[zone] ?? 0)) / Math.max(1, sum(ii.map((i) => panelDays[i].promoFirst)))) * 100
const nextStops = Object.keys(ZONE[PROMO].next).map((zone) => ({ zone, baseline: round(nextRate(iBase, zone), 1), campaign: round(nextRate(iCamp, zone), 1) }))
  .sort((a, b) => b.baseline - a.baseline)

const att = attribution()
const totalVisits = sum(zoneSummary.map((z) => z.visitors)), totalFirst = sum(zoneSummary.map((z) => z.primary))
const swIdx = dates.map((d, i) => (SILVER_WEEK.has(d) ? i : -1)).filter((i) => i >= 0)
const nonSwIdx = dates.map((d, i) => (SILVER_WEEK.has(d) ? -1 : i)).filter((i) => i >= 0)

const totalPosts = sum(posts)
const split = (total, parts) => {
  const out = {}; let left = total
  parts.forEach(([k, p], i) => { const n = i === parts.length - 1 ? left : Math.round(total * p); out[k] = n; left -= n })
  return out
}
const retail = {
  new_chitose: {
    venue: { en: 'New Chitose Airport (Sapporo)', ja: '新千歳空港（札幌）' },
    synthetic: true,
    window: { first: dates[0], last: dates[dates.length - 1], days: dates.length, baseline: BASELINE, during: CAMPAIGN, tail: TAIL },
    day_tags: dayTags,
    assumed_panel_devices_per_weekday: PANEL,
    terminal_device_days: sum(terminal),
    terminal_devices_per_day: Math.round(mean(terminal)),
    silver_week_uplift_pct: round((mean(swIdx.map((i) => terminal[i])) / mean(nonSwIdx.map((i) => terminal[i])) - 1) * 100, 0),
    retail_sessions: totalFirst,
    retail_conversion: round(totalFirst / sum(terminal), 3),
    zones_per_session: round(totalVisits / totalFirst, 2),
    promoted_zone: PROMO, neighbour_zone: NEIGHBOUR, control_zone: CONTROL,
    daily: Object.fromEntries(dates.map((d, i) => [d, {
      terminal_devices: terminal[i],
      posts: posts[i],
      engagement: engagement[i],
      promoted_visitors: zoneDaily[PROMO][i].visitors,
      promoted_share_pct: round(zoneDaily[PROMO][i].share * 100, 2),
      neighbour_share_pct: round(zoneDaily[NEIGHBOUR][i].share * 100, 2),
      control_share_pct: round(zoneDaily[CONTROL][i].share * 100, 2),
      promoted_revenue: zoneDaily[PROMO][i].revenue,
    }])),
    normalization: { promoted: normPromo, neighbour: normNeighbour, control: normControl },
    diff_in_diff_relative_pct: round(normPromo.relative_pct - normControl.relative_pct, 1),
    lag_correlation: lagCorr,
    best_lag: bestLag,
    social: {
      posts: totalPosts,
      campaign_posts: sum(iCamp.map((i) => posts[i])),
      engagement: sum(engagement),
      platforms: split(totalPosts, [['instagram', 0.52], ['tiktok', 0.27], ['x', 0.21]]),
      language_mix: split(totalPosts, [['ja', 0.68], ['en', 0.11], ['zh', 0.12], ['ko', 0.09]]),
      voice_mix: split(totalPosts, [['visitor_fan', 0.74], ['official', 0.15], ['press_creator', 0.11]]),
      topics: [
        { topic: { en: 'Hokkaido-limited collection', ja: '北海道限定コレクション' }, posts: Math.round(totalPosts * 0.31) },
        { topic: { en: 'Coupons and giveaways', ja: 'クーポン・プレゼント' }, posts: Math.round(totalPosts * 0.22) },
        { topic: { en: 'Travel outfits and purchases', ja: '旅コーデ・購入品' }, posts: Math.round(totalPosts * 0.17) },
        { topic: { en: 'Pre-flight shopping tips', ja: '出発前ショッピング' }, posts: Math.round(totalPosts * 0.12) },
        { topic: { en: 'Bought with souvenirs', ja: 'お土産と合わせ買い' }, posts: Math.round(totalPosts * 0.09) },
        { topic: { en: 'Queues and sold-out items', ja: '行列・品切れ' }, posts: Math.round(totalPosts * 0.05) },
      ],
    },
    zones: zoneSummary,
    cross_zone_visit_revenue_r: crossZoneR,
    cross_zone_visit_revenue_r_ex_dutyfree: crossZoneRExDutyFree,
    zone_transitions: transitions,
    promoted_next_stops: nextStops,
    attribution: att,
    stores: storeRows,
  },
}
if (!DRY) writeFileSync(join(OUT, 'jp_retail_readout.json'), JSON.stringify(retail, null, 1))

// =====================================================================================
// 2. AIRLINES × INBOUND TOURISM
// =====================================================================================
rnd = mulberry32(8824)

const AIRPORTS = [
  { id: 'NRT', label: { en: 'Narita', ja: '成田' }, lng: 140.39, lat: 35.77 },
  { id: 'HND', label: { en: 'Haneda', ja: '羽田' }, lng: 139.78, lat: 35.55 },
  { id: 'KIX', label: { en: 'Kansai', ja: '関西' }, lng: 135.24, lat: 34.43 },
  { id: 'CTS', label: { en: 'New Chitose', ja: '新千歳' }, lng: 141.69, lat: 42.78 },
  { id: 'FUK', label: { en: 'Fukuoka', ja: '福岡' }, lng: 130.45, lat: 33.59 },
  { id: 'NGO', label: { en: 'Chubu', ja: '中部' }, lng: 136.81, lat: 34.86 },
  { id: 'HIJ', label: { en: 'Hiroshima', ja: '広島' }, lng: 132.92, lat: 34.44 },
  { id: 'OKA', label: { en: 'Naha', ja: '那覇' }, lng: 127.65, lat: 26.2 },
]
// gateway = airport(s) that would serve the destination directly
const DESTS = [
  { id: 'tokyo', label: { en: 'Tokyo', ja: '東京' }, lng: 139.76, lat: 35.68, gateways: ['NRT', 'HND'], nights: 3.4 },
  { id: 'gotemba', label: { en: 'Gotemba / Fuji–Hakone', ja: '御殿場・富士箱根' }, lng: 138.93, lat: 35.31, gateways: ['NRT', 'HND'], nights: 1.1 },
  { id: 'kyoto', label: { en: 'Kyoto', ja: '京都' }, lng: 135.77, lat: 35.01, gateways: ['KIX'], nights: 2.3 },
  { id: 'osaka', label: { en: 'Osaka', ja: '大阪' }, lng: 135.5, lat: 34.69, gateways: ['KIX'], nights: 2.6 },
  { id: 'nara', label: { en: 'Nara', ja: '奈良' }, lng: 135.83, lat: 34.69, gateways: ['KIX'], nights: 0.6 },
  { id: 'sapporo', label: { en: 'Sapporo', ja: '札幌' }, lng: 141.35, lat: 43.06, gateways: ['CTS'], nights: 2.4 },
  { id: 'niseko_otaru', label: { en: 'Niseko / Otaru', ja: 'ニセコ・小樽' }, lng: 140.69, lat: 42.86, gateways: ['CTS'], nights: 1.9 },
  { id: 'furano_biei', label: { en: 'Furano / Biei', ja: '富良野・美瑛' }, lng: 142.38, lat: 43.34, gateways: ['CTS'], nights: 1.4 },
  { id: 'fukuoka', label: { en: 'Fukuoka', ja: '福岡' }, lng: 130.4, lat: 33.59, gateways: ['FUK'], nights: 2.2 },
  { id: 'yufuin_beppu', label: { en: 'Yufuin / Beppu', ja: '由布院・別府' }, lng: 131.36, lat: 33.27, gateways: ['FUK'], nights: 1.3 },
  { id: 'nagoya', label: { en: 'Nagoya', ja: '名古屋' }, lng: 136.91, lat: 35.17, gateways: ['NGO'], nights: 1.6 },
  { id: 'takayama_kanazawa', label: { en: 'Takayama / Kanazawa', ja: '高山・金沢' }, lng: 136.9, lat: 36.35, gateways: ['NGO'], nights: 1.7 },
  { id: 'hiroshima', label: { en: 'Hiroshima', ja: '広島' }, lng: 132.46, lat: 34.39, gateways: ['HIJ'], nights: 1.4 },
  { id: 'okinawa', label: { en: 'Okinawa', ja: '沖縄' }, lng: 127.68, lat: 26.21, gateways: ['OKA'], nights: 3.6 },
]
const GATEWAY_REGION = {
  CTS: { en: 'Hokkaido', ja: '北海道' }, KIX: { en: 'Kansai', ja: '関西' }, FUK: { en: 'Kyushu', ja: '九州' },
  NGO: { en: 'Central Japan', ja: '中部・北陸' }, HIJ: { en: 'Hiroshima', ja: '広島' }, OKA: { en: 'Okinawa', ja: '沖縄' },
}
const HOKKAIDO = ['sapporo', 'niseko_otaru', 'furano_biei']

// roaming-SIM devices by home network country (MCC). 'OT' = all other MCCs.
const NATS = [
  { id: 'KR', label: { en: 'South Korea', ja: '韓国' }, n: 5200, entry: { NRT: .21, HND: .12, KIX: .26, CTS: .07, FUK: .24, NGO: .04, HIJ: .02, OKA: .04 }, mod: { fukuoka: 1.4, yufuin_beppu: 1.6, osaka: 1.2 } },
  { id: 'TW', label: { en: 'Taiwan', ja: '台湾' }, n: 4300, entry: { NRT: .29, HND: .12, KIX: .24, CTS: .09, FUK: .08, NGO: .05, HIJ: .01, OKA: .12 }, mod: { sapporo: 2.3, takayama_kanazawa: 1.5 } },
  { id: 'CN', label: { en: 'Mainland China', ja: '中国' }, n: 3600, entry: { NRT: .29, HND: .18, KIX: .34, CTS: .05, FUK: .04, NGO: .07, HIJ: .01, OKA: .02 }, mod: { gotemba: 1.7, osaka: 1.2 } },
  { id: 'HK', label: { en: 'Hong Kong', ja: '香港' }, n: 2100, entry: { NRT: .31, HND: .14, KIX: .28, CTS: .08, FUK: .08, NGO: .04, HIJ: .01, OKA: .06 }, mod: { sapporo: 1.9, fukuoka: 1.3 } },
  { id: 'US', label: { en: 'United States', ja: '米国' }, n: 1900, entry: { NRT: .42, HND: .44, KIX: .10, CTS: .01, FUK: .01, NGO: .01, OKA: .01 }, mod: { hiroshima: 2.2, kyoto: 1.3, takayama_kanazawa: 1.4 } },
  { id: 'TH', label: { en: 'Thailand', ja: 'タイ' }, n: 1300, entry: { NRT: .40, HND: .14, KIX: .25, CTS: .10, FUK: .06, NGO: .05, OKA: 0 }, mod: { sapporo: 2.6, gotemba: 1.4 } },
  { id: 'AU', label: { en: 'Australia', ja: 'オーストラリア' }, n: 1000, entry: { NRT: .38, HND: .40, KIX: .14, CTS: .06, FUK: .01, NGO: .01, OKA: 0 }, mod: { hiroshima: 1.8, kyoto: 1.3, niseko_otaru: 1.4 } },
  { id: 'SG', label: { en: 'Singapore', ja: 'シンガポール' }, n: 800, entry: { NRT: .34, HND: .38, KIX: .18, CTS: .07, FUK: .02, NGO: .01, OKA: 0 }, mod: { sapporo: 2.1 } },
  { id: 'PH', label: { en: 'Philippines', ja: 'フィリピン' }, n: 700, entry: { NRT: .46, HND: .12, KIX: .22, CTS: .02, FUK: .08, NGO: .10, OKA: 0 }, mod: { nagoya: 1.5 } },
  { id: 'OT', label: { en: 'Other countries', ja: 'その他の国・地域' }, n: 500, entry: { NRT: .40, HND: .35, KIX: .20, CTS: .02, FUK: .02, NGO: .01, OKA: 0 }, mod: {} },
]

const TEMPLATES = {
  TOKYO: [
    [['tokyo'], .30], [['tokyo', 'gotemba'], .14], [['tokyo', 'kyoto', 'osaka'], .16],
    [['tokyo', 'gotemba', 'kyoto', 'osaka'], .10], [['tokyo', 'sapporo', 'niseko_otaru'], .07],
    [['tokyo', 'sapporo', 'furano_biei'], .04], [['tokyo', 'takayama_kanazawa', 'kyoto'], .05],
    [['tokyo', 'kyoto', 'osaka', 'hiroshima'], .06], [['tokyo', 'fukuoka'], .02],
    [['tokyo', 'okinawa'], .03], [['tokyo', 'nagoya'], .03],
  ],
  KIX: [
    [['osaka'], .22], [['osaka', 'kyoto'], .28], [['osaka', 'kyoto', 'nara'], .17], [['osaka', 'kyoto', 'tokyo'], .12],
    [['osaka', 'kyoto', 'gotemba', 'tokyo'], .05], [['osaka', 'hiroshima'], .07],
    [['osaka', 'kyoto', 'takayama_kanazawa'], .05], [['osaka', 'sapporo'], .02], [['osaka', 'fukuoka'], .02],
  ],
  CTS: [[['sapporo'], .25], [['sapporo', 'niseko_otaru'], .40], [['sapporo', 'furano_biei'], .22], [['sapporo', 'niseko_otaru', 'tokyo'], .13]],
  FUK: [[['fukuoka'], .40], [['fukuoka', 'yufuin_beppu'], .38], [['fukuoka', 'hiroshima'], .08], [['fukuoka', 'osaka', 'kyoto'], .14]],
  NGO: [[['nagoya'], .30], [['nagoya', 'takayama_kanazawa'], .35], [['nagoya', 'kyoto', 'osaka'], .25], [['nagoya', 'tokyo'], .10]],
  HIJ: [[['hiroshima'], .55], [['hiroshima', 'osaka', 'kyoto'], .27], [['hiroshima', 'fukuoka'], .18]],
  OKA: [[['okinawa'], .92], [['okinawa', 'tokyo'], .08]],
}
const pick = (pairs) => {
  const total = sum(pairs.map((p) => p[1]))
  let r = rnd() * total
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v }
  return pairs[pairs.length - 1][0]
}

// simulate one row per roaming device: nationality, entry airport, ordered itinerary
const devices = []
for (const nat of NATS) {
  for (let k = 0; k < nat.n; k++) {
    const airport = pick(Object.entries(nat.entry))
    const tpl = TEMPLATES[airport === 'NRT' || airport === 'HND' ? 'TOKYO' : airport]
    const weighted = tpl.map(([seq, w]) => [seq, w * seq.reduce((m, z) => m * (nat.mod[z] ?? 1), 1)])
    devices.push({ nat: nat.id, airport, seq: pick(weighted) })
  }
}

const destById = Object.fromEntries(DESTS.map((d) => [d.id, d]))
function aggregate(rows) {
  const n = rows.length
  const count = (keyFn) => { const m = new Map(); for (const r of rows) for (const k of [].concat(keyFn(r))) m.set(k, (m.get(k) ?? 0) + 1); return m }
  const airports = [...count((r) => r.airport)].map(([airport, arrivals]) => ({ airport, arrivals, share: round(arrivals / n, 3) })).sort((a, b) => b.arrivals - a.arrivals)
  const destinations = [...count((r) => r.seq)].map(([zone, visitors]) => ({ zone, visitors, share: round(visitors / n, 3), avg_nights: destById[zone].nights })).sort((a, b) => b.visitors - a.visitors)
  const flows = [...count((r) => r.seq.map((z) => `${r.airport}>${z}`))].map(([k, visitors]) => { const [airport, zone] = k.split('>'); return { airport, zone, visitors } }).sort((a, b) => b.visitors - a.visitors).slice(0, 16)
  const itineraries = [...count((r) => `${r.airport}>${r.seq.join('>')}`)].map(([k, d]) => { const [airport, ...seq] = k.split('>'); return { airport, seq, devices: d, share: round(d / n, 3) } }).sort((a, b) => b.devices - a.devices).slice(0, 7)
  const stops = mean(rows.map((r) => r.seq.length))
  const nights = mean(rows.map((r) => sum(r.seq.map((z) => destById[z].nights))))
  const multi = rows.filter((r) => r.seq.length > 1).length / n
  return { devices: n, airports, destinations, flows, itineraries, avg_destinations: round(stops, 2), avg_nights: round(nights, 1), multi_destination_share: round(multi, 3) }
}
const byNat = { ALL: aggregate(devices) }
for (const nat of NATS) byNat[nat.id] = aggregate(devices.filter((d) => d.nat === nat.id))

// the multi-stop "golden route" most often seen (the brief's Haneda → Kyoto → Osaka → Gotemba case)
const goldenRoute = (() => {
  const m = new Map()
  for (const d of devices) if (d.seq.includes('gotemba') && d.seq.includes('kyoto')) { const k = `${d.airport}>${d.seq.join('>')}`; m.set(k, (m.get(k) ?? 0) + 1) }
  const [k, n] = [...m].sort((x, y) => y[1] - x[1])[0]
  const [airport, ...seq] = k.split('>')
  return { airport, seq, devices: n, all_airports: sum([...m.values()]) }
})()

// ---- route evaluation: demand that reaches a region through SOMEONE ELSE'S gateway ----
const routes = []
for (const nat of NATS.filter((x) => x.id !== 'OT')) {
  const rows = devices.filter((d) => d.nat === nat.id)
  for (const gw of Object.keys(GATEWAY_REGION)) {
    const zones = DESTS.filter((d) => d.gateways.includes(gw)).map((d) => d.id)
    const visitors = rows.filter((r) => r.seq.some((z) => zones.includes(z)))
    if (!visitors.length) continue
    const indirect = visitors.filter((r) => r.airport !== gw)
    const entryCount = new Map()
    for (const r of indirect) entryCount.set(r.airport, (entryCount.get(r.airport) ?? 0) + 1)
    const via = [...entryCount].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([airport, n]) => ({ airport, devices: n }))
    const nights = mean(visitors.map((r) => sum(r.seq.filter((z) => zones.includes(z)).map((z) => destById[z].nights))))
    routes.push({
      market: nat.id, gateway: gw, region: GATEWAY_REGION[gw],
      region_visitors: visitors.length,
      direct_arrivals: visitors.length - indirect.length,
      indirect_arrivals: indirect.length,
      indirect_share: round(indirect.length / visitors.length, 3),
      share_of_market: round(visitors.length / rows.length, 3),
      via, avg_region_nights: round(nights, 1),
    })
  }
}
routes.sort((a, b) => b.indirect_arrivals - a.indirect_arrivals)

const roaming = devices.length
const TRAVEL_ESIM = 9800, UNKNOWN = 16900
const cohort = roaming + TRAVEL_ESIM + UNKNOWN
const tourism = {
  synthetic: true,
  window: { first: dates[0], last: dates[dates.length - 1], days: dates.length },
  inbound_cohort: cohort,
  cohort_definition: {
    en: 'Devices first seen inside an international-arrivals footprint during the window, absent from the panel for the prior 30 days, with no home anchor in Japan. Visitors whose phone is first seen after leaving the airport are not in this cohort.',
    ja: '期間中に国際線到着エリアで初めて観測され、直前30日間パネルに存在せず、日本国内に自宅推定地点を持たない端末。空港を出た後に初めて観測された訪日客は、このコホートに含まれません。',
  },
  nationality: {
    carrier_coverage: round(roaming / cohort, 3),
    class_counts: { roaming_home_sim: roaming, travel_esim: TRAVEL_ESIM, local_sim_or_unknown: UNKNOWN },
    // ASSUMPTION, not measured: the three class sizes are placeholders until the engine reports real carrier coverage.
    assumed: true,
    by_market: NATS.map((x) => ({ market: x.id, label: x.label, devices: x.n, share: round(x.n / roaming, 3) })),
  },
  airports: AIRPORTS,
  destinations: DESTS.map(({ id, label, lng, lat, gateways }) => ({ id, label, lng, lat, gateways })),
  hokkaido_zones: HOKKAIDO,
  market_airport_matrix: NATS.map((x) => ({
    market: x.id,
    shares: Object.fromEntries(AIRPORTS.map((a) => [a.id, byNat[x.id].airports.find((r) => r.airport === a.id)?.share ?? 0])),
  })),
  by_market: byNat,
  golden_route: goldenRoute,
  route_candidates: routes.slice(0, 12),
}
if (!DRY) writeFileSync(join(OUT, 'jp_tourism_readout.json'), JSON.stringify(tourism, null, 1))

if (!DRY) writeFileSync(join(OUT, 'jp_reference.json'), JSON.stringify({
  synthetic: true,
  window: { first: dates[0], last: dates[dates.length - 1], days: dates.length },
  panel: { note: 'SYNTHETIC illustrative data — not the Japan mobility panel. Shapes follow the engine exports.' },
  caveats: [
    'All figures are synthetic and illustrative; no client or panel data is shown.',
    'Panel estimates, not census; patterns over absolute counts.',
    'Nationality is partial — roaming / foreign-carrier devices only.',
    'Indoor resolution is zone-level; store-level visits need a venue-side signal.',
  ],
}, null, 1))

console.log('retail  promoted lift', normPromo.relative_pct + '%', 'MDE ±' + normPromo.mde_relative_pct + '%', 'detected', normPromo.detected)
console.log('retail  control lift ', normControl.relative_pct + '%', 'MDE ±' + normControl.mde_relative_pct + '%', 'detected', normControl.detected)
console.log('retail  neighbour    ', normNeighbour.relative_pct + '%', 'MDE ±' + normNeighbour.mde_relative_pct + '%', 'detected', normNeighbour.detected)
console.log('retail  lag r        ', lagCorr.map((l) => `${l.lag_days}d=${l.pearson_r}`).join(' '))
console.log('retail  attribution  ', JSON.stringify(att))
console.log('retail  zone r raw/adj ', zoneSummary.map((z) => `${z.zone}=${z.daily_visit_revenue_r}/${z.daily_visit_revenue_r_adjusted}`).join(' '), 'cross', crossZoneR, 'ex-df', crossZoneRExDutyFree)
console.log('tourism cohort', cohort, 'roaming', roaming, 'coverage', tourism.nationality.carrier_coverage)
console.log('tourism routes', routes.slice(0, 6).map((r) => `${r.market}>${r.gateway}:${r.indirect_arrivals}/${r.region_visitors}`).join(' '))
console.log('tourism top itineraries', byNat.ALL.itineraries.slice(0, 4).map((i) => `${i.airport}>${i.seq.join('>')}:${i.devices}`).join(' | '))
if (process.env.DIAG) {
  const P = zoneDaily[PROMO]
  console.log('DIAG fashion visits/day base', mean(iBase.map((i) => P[i].visitors)).toFixed(1), 'camp', mean(iCamp.map((i) => P[i].visitors)).toFixed(1),
    'panel extra visits/day camp', mean(iCamp.map((i) => panelDays[i].inc[PROMO])).toFixed(1), 'terminal base', mean(iBase.map((i) => terminal[i])).toFixed(0), 'camp', mean(iCamp.map((i) => terminal[i])).toFixed(0),
    'share base', normPromo.baseline_share_pct, 'quiet-day share mean', mean(iQuiet.map((i) => P[i].share * 100)).toFixed(2))
}
if (process.env.POWER) {
  console.log('POWER', JSON.stringify({ promo: normPromo.relative_pct, promoMde: normPromo.mde_relative_pct, promoDet: normPromo.detected, neigh: normNeighbour.relative_pct, neighMde: normNeighbour.mde_relative_pct, neighDet: normNeighbour.detected && normNeighbour.relative_pct > 0, ctrlDet: normControl.detected, bestLag: bestLag.lag_days, trans: att.transition_per_day, spill: att.secondary.incremental_visits_from_promoted, nInc: att.secondary.incremental_visits, pm: att.primary.modelled_revenue, pr: att.primary.reported_revenue_uplift, sm: att.secondary.modelled_revenue, sr: att.secondary.reported_revenue_uplift, lagR: bestLag.pearson_r, adj: zoneSummary.map((z) => z.daily_visit_revenue_r_adjusted) }))
}
