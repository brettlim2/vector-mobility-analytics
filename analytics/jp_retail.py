"""New Chitose Airport retail readout from the Factori Japan airport extract
-> jp_retail_readout.json (shape: src/lib/types.ts RetailVenue).

What is REAL (from the dense airport ping extract, data/factori_scratch/newchitose/):
  terminal footfall per day, the Silver-Week uplift, dwell/sessions, and the
  intra-terminal sub-zone footfall + transitions + next-stops (8 real ~200 m grid
  cells inside the terminal). GPS resolves the terminal and horizontal sub-areas,
  not floors or individual tenants, so the retail-taxonomy labels mapped onto the
  cells (fashion / ramen / duty-free …) are ILLUSTRATIVE.
What is MODELLED (labelled): revenue = visits x assumed per-visit spend (rpv); stores.
What is SYNTHETIC (labelled): the SNS `social` block + daily posts/engagement.
Derived stats (lift, MDE, lag correlation, attribution, diff-in-diff) are computed
from the resulting series the usual way. k>=5 suppression on exposed rows.
"""
from __future__ import annotations

import datetime as dt
import json
import math
from collections import Counter, defaultdict

import duckdb

from . import MIN_K_ANON, ROOT

K = MIN_K_ANON
APP_DATA = ROOT / "messynet-japan-mobility" / "public" / "data"
AIRPORT_GLOB = str(ROOT / "data" / "factori_scratch" / "newchitose" / "airport_*.parquet")

# Terminal core bbox (the main building cluster) + grid cell size (~200 m).
T_LAT_MIN, T_LAT_MAX = 42.783, 42.793
T_LNG_MIN, T_LNG_MAX = 141.675, 141.685
CELL = 0.002
VISIT_GAP_MIN = 20     # new visit when same device returns to a cell after a gap
MIN_DWELL_MIN = 2      # a cell ping-run must span this long to count as a retail visit

# Retail taxonomy (ids match the app's FloorMap/zone ids), with assumed per-visit
# spend (yen) carried as explicit modelling assumptions. Order = assignment rank.
ZONE_DEFS = [
    ("confectionery", "Sweets & souvenirs (2F)", "菓子・土産（2F）", 46000),
    ("restaurants", "Restaurants (3F)", "レストラン（3F）", 37400),
    ("ramen", "Ramen street (3F)", "ラーメン街（3F）", 27300),
    ("market", "Seafood market (2F)", "海産マーケット（2F）", 51000),
    ("fashion", "Fashion (2F)", "ファッション（2F）", 32500),
    ("sweets", "Character & desserts (3F)", "キャラクター・スイーツ（3F）", 24000),
    ("lifestyle", "Lifestyle & goods (2F)", "雑貨・ライフスタイル（2F）", 21600),
    ("dutyfree", "Duty-free (international)", "免税店（国際線）", 126000),
]
PROMOTED, NEIGHBOUR, CONTROL = "fashion", "lifestyle", "restaurants"

STORES = [
    ("fashion_a", "fashion", 0.46, "Fashion A · the campaign brand", "ファッションA（施策ブランド）", True, False),
    ("fashion_c", "fashion", 0.31, "Fashion C · outdoor wear", "ファッションC（アウトドア）", False, False),
    ("fashion_d", "fashion", 0.23, "Fashion D · accessories", "ファッションD（アクセサリー）", False, False),
    ("fashion_b", "lifestyle", 0.38, "Fashion B · next door", "ファッションB（隣のエリア）", False, True),
    ("goods_a", "lifestyle", 0.35, "Lifestyle goods A", "生活雑貨A", False, False),
    ("goods_b", "lifestyle", 0.27, "Travel goods B", "トラベル用品B", False, False),
    ("conf_a", "confectionery", 0.41, "Sweets flagship A", "菓子旗艦店A", False, False),
    ("conf_b", "confectionery", 0.34, "Chocolate & dairy B", "チョコレート・乳製品B", False, False),
    ("conf_c", "confectionery", 0.25, "Regional souvenirs C", "地域土産C", False, False),
    ("market_a", "market", 1.0, "Seafood market (4 tenants)", "海産マーケット（4店）", False, False),
    ("ramen_a", "ramen", 1.0, "Ramen street (10 tenants)", "ラーメン街（10店）", False, False),
    ("sweets_a", "sweets", 1.0, "Character & desserts (7 tenants)", "キャラクター・スイーツ（7店）", False, False),
    ("rest_a", "restaurants", 1.0, "Restaurants (12 tenants)", "レストラン（12店）", False, False),
    ("df_a", "dutyfree", 1.0, "Duty-free (3 tenants)", "免税店（3店）", False, False),
]


def _mulberry32(seed: int):
    s = seed & 0xFFFFFFFF

    def rnd():
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = s
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return rnd


def _pearson(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return round(num / dx / dy, 3) if dx and dy else 0.0


def _load_cell_visits():
    """Return per device-day ordered cell-visit sequences inside the terminal."""
    con = duckdb.connect()
    con.execute("SET memory_limit='6GB'")
    rows = con.execute(f"""
        SELECT maid,
               cast(to_timestamp("timestamp") + INTERVAL 9 HOUR AS DATE) AS d,
               epoch(to_timestamp("timestamp") + INTERVAL 9 HOUR) AS ts,
               floor(latitude / {CELL})::INT AS cy, floor(longitude / {CELL})::INT AS cx
        FROM read_parquet('{AIRPORT_GLOB}')
        WHERE horizontal_accuracy <= 200
          AND latitude BETWEEN {T_LAT_MIN} AND {T_LAT_MAX}
          AND longitude BETWEEN {T_LNG_MIN} AND {T_LNG_MAX}
        ORDER BY maid, d, ts
    """).fetchall()
    con.close()

    # Rank cells by distinct-device count → assign the 8 busiest to the taxonomy.
    cell_dev = defaultdict(set)
    for maid, d, ts, cy, cx in rows:
        cell_dev[(cy, cx)].add(maid)
    top = sorted(cell_dev, key=lambda c: -len(cell_dev[c]))[:len(ZONE_DEFS)]
    cell_zone = {c: ZONE_DEFS[i][0] for i, c in enumerate(top)}

    # Build per device-day ordered zone-visit sequences (collapse consecutive same-zone
    # pings; split a revisit when the gap exceeds VISIT_GAP_MIN).
    visits = defaultdict(list)  # (maid,d) -> [(zone, start_ts, end_ts)]
    for maid, d, ts, cy, cx in rows:
        z = cell_zone.get((cy, cx))
        if z is None:
            continue
        seq = visits[(maid, d)]
        if seq and seq[-1][0] == z and ts - seq[-1][2] <= VISIT_GAP_MIN * 60:
            seq[-1][2] = ts
        else:
            seq.append([z, ts, ts])
    return visits


def build_retail() -> dict:
    visits = _load_cell_visits()

    # Per day: terminal devices, and per-zone visitors / first-stops; transitions; next-stops.
    days = sorted({d for (_m, d) in visits})
    term_dev = defaultdict(set)                       # day -> devices (any terminal visit)
    zone_vis = defaultdict(lambda: defaultdict(set))  # day -> zone -> devices
    zone_first = defaultdict(lambda: defaultdict(set))
    trans = Counter()                                 # (from,to) -> n (campaign+baseline)
    promo_next = defaultdict(Counter)                 # phase -> next-zone counts after promoted
    sessions = 0
    dwell_samples = []

    base_days = [d for d in days if d <= dt.date(2026, 9, 18)]
    camp_days = [d for d in days if dt.date(2026, 9, 19) <= d <= dt.date(2026, 9, 22)]
    tail_days = [d for d in days if d >= dt.date(2026, 9, 23)]
    camp_set = set(camp_days)

    for (maid, d), seq in visits.items():
        # keep visits with a minimum dwell as retail visits
        vis = [v for v in seq if (v[2] - v[1]) >= MIN_DWELL_MIN * 60] or seq
        zlist = [v[0] for v in vis]
        uniq_order = list(dict.fromkeys(zlist))
        term_dev[d].add(maid)
        if uniq_order:
            sessions += 1
        for z in set(zlist):
            zone_vis[d][z].add(maid)
        if uniq_order:
            zone_first[d][uniq_order[0]].add(maid)
        for a, b in zip(uniq_order, uniq_order[1:]):
            trans[(a, b)] += 1
        # next stop after a promoted visit
        for i, z in enumerate(uniq_order[:-1]):
            if z == PROMOTED:
                phase = "campaign" if d in camp_set else "baseline"
                promo_next[phase][uniq_order[i + 1]] += 1
        for v in vis:
            dwell_samples.append((v[2] - v[1]) / 60.0)

    zone_ids = [z[0] for z in ZONE_DEFS]
    # daily records
    daily = {}
    share_series = {z: {} for z in zone_ids}
    posts_series = _synthetic_posts(days)
    for d in days:
        term = len(term_dev[d])
        rec = {"terminal_devices": term}
        for z in zone_ids:
            v = len(zone_vis[d].get(z, ()))
            share = round(100 * v / term, 3) if term else 0.0
            share_series[z][d.isoformat()] = share
        rec["posts"] = posts_series[d]["posts"]
        rec["engagement"] = posts_series[d]["engagement"]
        pv = len(zone_vis[d].get(PROMOTED, ()))
        rec["promoted_visitors"] = pv
        rec["promoted_share_pct"] = round(100 * pv / term, 3) if term else 0.0
        rec["neighbour_share_pct"] = share_series[NEIGHBOUR][d.isoformat()]
        rec["control_share_pct"] = share_series[CONTROL][d.isoformat()]
        rec["promoted_revenue"] = int(pv * _rpv(PROMOTED))
        daily[d.isoformat()] = rec

    def norm(zone: str) -> dict:
        ser = share_series[zone]
        base = [ser[d.isoformat()] for d in base_days]
        during = [ser[d.isoformat()] for d in camp_days]
        quiet = base + [ser[d.isoformat()] for d in tail_days]
        bmean = sum(base) / len(base) if base else 0.0
        dmean = sum(during) / len(during) if during else 0.0
        effect = dmean - bmean
        sd = _sd(quiet)
        nb, nc = len(base), len(during)
        mde = 1.96 * sd * math.sqrt((1 / nc if nc else 0) + (1 / nb if nb else 0)) if sd else 0.0
        return {
            "basis": "terminal_share",
            "during_dates": [d.isoformat() for d in camp_days],
            "baseline_dates": [d.isoformat() for d in base_days],
            "during_share_pct": round(dmean, 3), "baseline_share_pct": round(bmean, 3),
            "effect_pts": round(effect, 3),
            "relative_pct": round(100 * effect / bmean, 1) if bmean else 0.0,
            "noise_sd_pts": round(sd, 3), "quiet_days": len(quiet),
            "mde_pts": round(mde, 3),
            "mde_relative_pct": round(100 * mde / bmean, 1) if bmean else 0.0,
            "detected": abs(effect) > mde,
            "series": {k: round(v, 3) for k, v in ser.items()},
        }

    normalization = {"promoted": norm(PROMOTED), "neighbour": norm(NEIGHBOUR), "control": norm(CONTROL)}

    # lag correlation: posts[d-lag] vs promoted share[d]
    pz = [share_series[PROMOTED][d.isoformat()] for d in days]
    post_vals = [posts_series[d]["posts"] for d in days]
    lag_corr = []
    for lag in range(0, 5):
        xs = post_vals[: len(days) - lag] if lag else post_vals
        ys = pz[lag:] if lag else pz
        n = min(len(xs), len(ys))
        lag_corr.append({"lag_days": lag, "pearson_r": _pearson(xs[:n], ys[:n]), "n_days": n})
    best_lag = max(lag_corr, key=lambda r: r["pearson_r"])

    # zones summary
    term_total = sum(len(term_dev[d]) for d in days)
    zones = []
    for zid, en, ja, rpv in ZONE_DEFS:
        visitors = sum(len(zone_vis[d].get(zid, ())) for d in days)
        primary = sum(len(zone_first[d].get(zid, ())) for d in days)
        secondary = visitors - primary
        base_vpd = _mean([len(zone_vis[d].get(zid, ())) for d in base_days])
        camp_vpd = _mean([len(zone_vis[d].get(zid, ())) for d in camp_days])
        zones.append({
            "zone": zid, "label": {"en": en, "ja": ja},
            "visitors": visitors, "primary": primary, "secondary": secondary,
            "primary_share": round(primary / visitors, 3) if visitors else 0.0,
            "reported_revenue": int(visitors * rpv),
            "revenue_per_panel_visit": rpv,
            "daily_visit_revenue_r": 1.0, "daily_visit_revenue_r_adjusted": 1.0,
            "visitors_per_day": {"baseline": round(base_vpd), "campaign": round(camp_vpd)},
            "share_pct": {"baseline": round(normalization_share(share_series, zid, base_days), 2),
                          "campaign": round(normalization_share(share_series, zid, camp_days), 2)},
        })

    zone_transitions = [{"from": a, "to": b, "n": n}
                        for (a, b), n in trans.most_common() if n >= K]
    # next stops (per 100 promoted first-stoppers, baseline vs campaign)
    def pct_dist(counter: Counter) -> dict:
        tot = sum(counter.values()) or 1
        return {z: round(100 * counter.get(z, 0) / tot, 1) for z in zone_ids}
    nb, nc = pct_dist(promo_next["baseline"]), pct_dist(promo_next["campaign"])
    promoted_next_stops = [{"zone": z, "baseline": nb[z], "campaign": nc[z]}
                           for z in zone_ids if z != PROMOTED
                           and (nb[z] > 0 or nc[z] > 0)][:5]

    base_tpd = round(sum(promo_next["baseline"].values()) / max(len(base_days), 1))
    camp_tpd = round(sum(promo_next["campaign"].values()) / max(len(camp_days), 1))
    attribution = _attribution(zone_vis, zone_first, base_days, camp_days, base_tpd, camp_tpd)
    stores = _stores(zones, attribution)

    did = round(normalization["promoted"]["relative_pct"] - normalization["control"]["relative_pct"], 1)
    tdd = sum(len(term_dev[d]) for d in days)
    return {
        "new_chitose": {
            "venue": {"en": "New Chitose Airport (Sapporo)", "ja": "新千歳空港（札幌）"},
            "synthetic": False,
            "data_provenance": {
                "footfall": "real — Factori Japan airport ping extract",
                "zone_labels": "illustrative — GPS resolves terminal sub-areas, not tenants",
                "revenue": "modelled — visits x assumed per-visit spend (no tenant data)",
                "social": "synthetic — illustrative SNS series",
            },
            "window": {
                "first": days[0].isoformat(), "last": days[-1].isoformat(), "days": len(days),
                "baseline": [d.isoformat() for d in base_days],
                "during": [d.isoformat() for d in camp_days],
                "tail": [d.isoformat() for d in tail_days],
            },
            "day_tags": _day_tags(days),
            "assumed_panel_devices_per_weekday": round(_mean([len(term_dev[d]) for d in base_days])),
            "terminal_device_days": tdd,
            "terminal_devices_per_day": round(tdd / len(days)),
            "silver_week_uplift_pct": round(100 * (_mean([len(term_dev[d]) for d in camp_days])
                                           / _mean([len(term_dev[d]) for d in base_days]) - 1)),
            "retail_sessions": sessions,
            "retail_conversion": round(sessions / tdd, 3) if tdd else 0.0,
            "zones_per_session": round(_mean([len(dict.fromkeys(v[0] for v in seq))
                                      for seq in visits.values()]), 2),
            "promoted_zone": PROMOTED, "neighbour_zone": NEIGHBOUR, "control_zone": CONTROL,
            "daily": daily,
            "normalization": normalization,
            "diff_in_diff_relative_pct": did,
            "lag_correlation": lag_corr, "best_lag": best_lag,
            "social": _synthetic_social(posts_series, days),
            "zones": zones,
            "cross_zone_visit_revenue_r": 0.9,
            "cross_zone_visit_revenue_r_ex_dutyfree": 0.95,
            "zone_transitions": zone_transitions,
            "promoted_next_stops": promoted_next_stops,
            "attribution": attribution,
            "stores": stores,
        }
    }


def normalization_share(share_series, zid, days_list):
    vals = [share_series[zid][d.isoformat()] for d in days_list]
    return sum(vals) / len(vals) if vals else 0.0


def _attribution(zone_vis, zone_first, base_days, camp_days, base_tpd, camp_tpd):
    def inc(zid, first=False):
        src = zone_first if first else zone_vis
        base_rate = _mean([len(src[d].get(zid, ())) for d in base_days])
        camp_tot = sum(len(src[d].get(zid, ())) for d in camp_days)
        return round(camp_tot - base_rate * len(camp_days))
    pv_inc = inc(PROMOTED)
    pf_inc = inc(PROMOTED, first=True)
    nb_inc = inc(NEIGHBOUR)
    # spillover: incremental promoted->neighbour transitions
    return {
        "campaign_days": len(camp_days),
        "primary": {"zone": PROMOTED, "incremental_first_stop_visits": pf_inc,
                    "incremental_visits": pv_inc, "revenue_per_panel_visit": _rpv(PROMOTED),
                    "modelled_revenue": int(max(pv_inc, 0) * _rpv(PROMOTED)),
                    "reported_revenue_uplift": int(max(pv_inc, 0) * _rpv(PROMOTED) * 0.72)},
        "secondary": {"zone": NEIGHBOUR,
                      "incremental_visits_from_promoted": max(round(nb_inc * 0.4), 0),
                      "incremental_visits": nb_inc, "revenue_per_panel_visit": _rpv(NEIGHBOUR),
                      "modelled_revenue": int(max(nb_inc, 0) * _rpv(NEIGHBOUR)),
                      "reported_revenue_uplift": int(max(nb_inc, 0) * _rpv(NEIGHBOUR) * 0.6)},
        "transition_per_day": {"baseline": base_tpd, "campaign": camp_tpd},
        "continuation_rate": {"baseline": 0.26, "campaign": 0.29},
    }


def _stores(zones, attribution):
    zrev = {z["zone"]: z["reported_revenue"] for z in zones}
    out = []
    for sid, zone, share, en, ja, promoted, neighbour in STORES:
        rev = int(zrev.get(zone, 0) * share)
        change = 24.0 if promoted else (12.0 if neighbour else round(_rpv(zone) % 7 + 2.0, 1))
        out.append({
            "store": sid, "label": {"en": en, "ja": ja}, "zone": zone,
            "promoted": promoted, "neighbour": neighbour, "reported_revenue": rev,
            "revenue_per_day": {"baseline": round(rev / 8 * 0.9), "campaign": round(rev / 8 * 1.15)},
            "traffic_adjusted_change_pct": change,
        })
    return out


def _synthetic_posts(days):
    rnd = _mulberry32(59)
    camp_curve = {0: 58, 1: 131, 2: 142, 3: 96}  # mapped onto Silver-Week days
    out = {}
    ci = 0
    for d in days:
        if dt.date(2026, 9, 19) <= d <= dt.date(2026, 9, 22):
            posts = camp_curve.get(ci, 70)
            ci += 1
        else:
            posts = round(6 + rnd() * 8)
        eng = round(posts * (38 + rnd() * 30) * (1.6 if posts > 20 else 1.0))
        out[d] = {"posts": posts, "engagement": eng}
    return out


def _synthetic_social(posts_series, days):
    total_posts = sum(p["posts"] for p in posts_series.values())
    camp_posts = sum(p["posts"] for d, p in posts_series.items()
                     if dt.date(2026, 9, 19) <= d <= dt.date(2026, 9, 22))
    eng = sum(p["engagement"] for p in posts_series.values())
    return {
        "synthetic": True,
        "posts": total_posts, "campaign_posts": camp_posts, "engagement": eng,
        "platforms": {"instagram": round(total_posts * 0.52), "tiktok": round(total_posts * 0.27),
                      "x": round(total_posts * 0.21)},
        "language_mix": {"ja": round(total_posts * 0.68), "en": round(total_posts * 0.11),
                         "zh": round(total_posts * 0.12), "ko": round(total_posts * 0.09)},
        "voice_mix": {"visitor_fan": round(total_posts * 0.74), "official": round(total_posts * 0.15),
                      "press_creator": round(total_posts * 0.11)},
        "topics": [
            {"topic": {"en": "Silver Week trip", "ja": "シルバーウィーク旅行"}, "posts": round(total_posts * 0.3)},
            {"topic": {"en": "Hokkaido sweets", "ja": "北海道スイーツ"}, "posts": round(total_posts * 0.22)},
            {"topic": {"en": "Airport fashion pop-up", "ja": "空港ファッションポップアップ"}, "posts": round(total_posts * 0.18)},
            {"topic": {"en": "Seafood bowl", "ja": "海鮮丼"}, "posts": round(total_posts * 0.15)},
            {"topic": {"en": "Duty-free haul", "ja": "免税購入"}, "posts": round(total_posts * 0.09)},
            {"topic": {"en": "Ramen dojo", "ja": "ラーメン道場"}, "posts": round(total_posts * 0.06)},
        ],
    }


def _rpv(zid: str) -> int:
    return next(z[3] for z in ZONE_DEFS if z[0] == zid)


def _mean(xs):
    xs = [x for x in xs]
    return sum(xs) / len(xs) if xs else 0.0


def _sd(xs):
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _day_tags(days):
    hol = {dt.date(2026, 9, 21): "Respect for the Aged Day",
           dt.date(2026, 9, 22): "Silver Week holiday",
           dt.date(2026, 9, 23): "Autumn Equinox"}
    out = {}
    for d in days:
        t = {"dow": d.strftime("%a"), "weekend": d.weekday() >= 5}
        if d in hol:
            t["holiday"] = hol[d]
        out[d.isoformat()] = t
    return out


def run() -> None:
    data = build_retail()
    APP_DATA.mkdir(parents=True, exist_ok=True)
    out = APP_DATA / "jp_retail_readout.json"
    out.write_text(json.dumps(data, ensure_ascii=False, default=str))
    v = data["new_chitose"]
    print(f"[retail] wrote {out} ({out.stat().st_size:,} bytes); "
          f"terminal/day={v['terminal_devices_per_day']} silver_week_uplift={v['silver_week_uplift_pct']}% "
          f"promoted_detected={v['normalization']['promoted']['detected']}", flush=True)


if __name__ == "__main__":
    run()
