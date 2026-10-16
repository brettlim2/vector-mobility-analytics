"""Domestic tourism readout from the Factori Japan warehouse -> jp_tourism_readout.json.

Reframes the messynet Tourism dashboard from *inbound* (not supportable by this
domestic resident panel) to *domestic* inter-regional travel: where travellers come
from (origin region), which gateway (airport/hub) they entered a region through, which
destinations they visited, how long, and which regions pull demand through another
region's gateway (direct vs indirect).

Shapes follow src/lib/types.ts (Tourism / MarketAgg / RouteCandidate). Gateway and
destination ids match the ids the app's FlowMap lays out. k>=5 suppression on exposed
rows; only aggregates leave the warehouse.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict

import os
from pathlib import Path

from . import MIN_K_ANON, ROOT
from .engine import connect

K = MIN_K_ANON
# Target the messynet app's public/data. Override with MESSYNET_APP_DIR (the app repo root)
# once the app lives in its own repo; default to the in-repo vendored copy.
_APP_ROOT = Path(os.environ["MESSYNET_APP_DIR"]) if os.environ.get("MESSYNET_APP_DIR") \
    else ROOT / "messynet-japan-mobility"
APP_DATA = _APP_ROOT / "public" / "data"

# Gateways the FlowMap knows: id -> (lat, lng, home_region). Tight radius around each.
GATEWAYS = {
    "CTS": (42.7752, 141.6923, "hokkaido"),
    "NRT": (35.7720, 140.3929, "kanto"),
    "HND": (35.5494, 139.7798, "kanto"),
    "KIX": (34.4347, 135.2440, "kansai"),
    "NGO": (34.8584, 136.8048, "chubu"),
    "FUK": (33.5859, 130.4510, "kyushu"),
    "HIJ": (34.4361, 132.9190, "chugoku"),
    "OKA": (26.2060, 127.6490, "okinawa"),
}
GATEWAY_RADIUS_M = 7000
# Primary gateway per region — the hub a traveller is taken to have entered the region
# through (domestic travel is mostly rail, so the physical-airport stop is not required;
# the gateway is the region's representative entry point for the FlowMap arcs).
PRIMARY_GATEWAY = {
    "hokkaido": "CTS", "kanto": "HND", "kansai": "KIX", "chubu": "NGO",
    "kyushu": "FUK", "chugoku": "HIJ", "okinawa": "OKA",
}

# Destination ids the FlowMap lays out, with coords + gateways (reference geography).
DESTS = [
    ("tokyo", "Tokyo", "東京", 139.76, 35.68, ["NRT", "HND"]),
    ("gotemba", "Gotemba / Fuji–Hakone", "御殿場・富士箱根", 138.93, 35.31, ["NRT", "HND"]),
    ("kyoto", "Kyoto", "京都", 135.77, 35.01, ["KIX"]),
    ("osaka", "Osaka", "大阪", 135.50, 34.69, ["KIX"]),
    ("nara", "Nara", "奈良", 135.83, 34.69, ["KIX"]),
    ("sapporo", "Sapporo", "札幌", 141.35, 43.06, ["CTS"]),
    ("niseko_otaru", "Niseko / Otaru", "ニセコ・小樽", 140.69, 42.86, ["CTS"]),
    ("furano_biei", "Furano / Biei", "富良野・美瑛", 142.38, 43.34, ["CTS"]),
    ("nagoya", "Nagoya", "名古屋", 136.88, 35.17, ["NGO"]),
    ("takayama_kanazawa", "Takayama / Kanazawa", "高山・金沢", 136.65, 36.58, ["NGO", "KIX"]),
    ("hiroshima", "Hiroshima", "広島", 132.46, 34.39, ["HIJ"]),
    ("fukuoka", "Fukuoka", "福岡", 130.40, 33.59, ["FUK"]),
    ("yufuin_beppu", "Yufuin / Beppu", "湯布院・別府", 131.50, 33.28, ["FUK"]),
    ("okinawa", "Okinawa", "沖縄", 127.68, 26.21, ["OKA"]),
]
DEST_REGION = {
    "tokyo": "kanto", "gotemba": "kanto", "kyoto": "kansai", "osaka": "kansai",
    "nara": "kansai", "sapporo": "hokkaido", "niseko_otaru": "hokkaido",
    "furano_biei": "hokkaido", "nagoya": "chubu", "takayama_kanazawa": "chubu",
    "hiroshima": "chugoku", "fukuoka": "kyushu", "yufuin_beppu": "kyushu",
    "okinawa": "okinawa",
}
REGION_LABEL = {
    "hokkaido": ("Hokkaido", "北海道"), "tohoku": ("Tohoku", "東北"),
    "kanto": ("Kanto", "関東"), "chubu": ("Chubu", "中部"), "kansai": ("Kansai", "関西"),
    "chugoku": ("Chugoku", "中国"), "shikoku": ("Shikoku", "四国"),
    "kyushu": ("Kyushu", "九州"), "okinawa": ("Okinawa", "沖縄"), "other": ("Other", "その他"),
}

# Warehouse zone name -> destination id (maps our 57 metro zones onto FlowMap dests).
ZONE_DEST = {
    "Sapporo": "sapporo", "New Chitose Airport": "sapporo",
    "Nagoya Station / Meieki": "nagoya", "Nagoya Sakae": "nagoya",
    "Chubu Centrair Airport": "nagoya",
    "Kyoto Station": "kyoto", "Kyoto Downtown / Gion": "kyoto",
    "Osaka Umeda / Kita": "osaka", "Osaka Namba / Minami": "osaka", "Shin-Osaka": "osaka",
    "Osaka Bay / USJ": "osaka", "Tennoji / Abeno": "osaka", "Kobe Sannomiya": "osaka",
    "Kansai Airport": "osaka", "Nara": "nara",
    "Hiroshima": "hiroshima", "Okayama": "hiroshima",
    "Fukuoka Hakata": "fukuoka", "Fukuoka Tenjin": "fukuoka", "Fukuoka Airport": "fukuoka",
    "Kanazawa": "takayama_kanazawa", "Niigata": "takayama_kanazawa",
    "Naha / Okinawa": "okinawa",
}
# Tokyo/Kanto zones -> tokyo
for _z in [
    "Marunouchi / Tokyo Stn", "Otemachi / Chiyoda", "Nihonbashi / Chuo", "Ginza",
    "Shimbashi / Shiodome", "Minato / Roppongi", "Toranomon / Kasumigaseki", "Shinagawa",
    "Shinjuku", "Shibuya", "Harajuku / Omotesando", "Ikebukuro / Toshima", "Ueno / Taito",
    "Asakusa", "Akihabara", "Tokyo Skytree / Sumida", "Odaiba / Koto", "Bunkyo / Hongo",
    "Nakano", "Setagaya", "Kichijoji / Musashino", "Tachikawa", "Machida",
    "Yokohama / Minato Mirai", "Shin-Yokohama", "Kawasaki", "Saitama / Omiya", "Chiba",
    "Tokyo Disney / Maihama", "Makuhari", "Haneda Airport", "Narita Airport", "Tsukuba",
]:
    ZONE_DEST[_z] = "tokyo"

# Warehouse zone name -> origin region (for home / by_market).
ZONE_REGION = {
    "Sapporo": "hokkaido", "New Chitose Airport": "hokkaido", "Sendai": "tohoku",
    "Niigata": "chubu", "Kanazawa": "chubu", "Nagoya Station / Meieki": "chubu",
    "Nagoya Sakae": "chubu", "Chubu Centrair Airport": "chubu",
    "Hiroshima": "chugoku", "Okayama": "chugoku",
    "Fukuoka Hakata": "kyushu", "Fukuoka Tenjin": "kyushu", "Fukuoka Airport": "kyushu",
    "Naha / Okinawa": "okinawa",
}
for _z, _d in ZONE_DEST.items():
    ZONE_REGION.setdefault(_z, DEST_REGION.get(_d, "other"))
for _z in ["Kyoto Station", "Kyoto Downtown / Gion", "Osaka Umeda / Kita",
           "Osaka Namba / Minami", "Shin-Osaka", "Osaka Bay / USJ", "Tennoji / Abeno",
           "Kobe Sannomiya", "Kansai Airport", "Nara"]:
    ZONE_REGION[_z] = "kansai"


def _lbl(en: str, ja: str) -> dict:
    return {"en": en, "ja": ja}


def build_tourism() -> dict:
    con = connect(read_only=True)

    # Per-device home region (night-time most-frequent zone -> region) via a zone map.
    zone_region_cases = " ".join(
        f"WHEN zone = '{z.replace(chr(39), chr(39)*2)}' THEN '{r}'" for z, r in ZONE_REGION.items()
    )
    zone_dest_cases = " ".join(
        f"WHEN zone = '{z.replace(chr(39), chr(39)*2)}' THEN '{d}'" for z, d in ZONE_DEST.items()
    )
    con.execute(f"CREATE TEMP MACRO zreg(zone) AS (CASE {zone_region_cases} ELSE 'other' END)")
    con.execute(f"CREATE TEMP MACRO zdest(zone) AS (CASE {zone_dest_cases} ELSE NULL END)")

    con.execute("""
        CREATE TEMP TABLE dev_home AS
        WITH night AS (
          SELECT device_id, zreg(zone) AS region, count(*) n
          FROM stops WHERE start_hour < 7 OR start_hour >= 21
          GROUP BY 1, 2
        )
        SELECT device_id, arg_max(region, n) AS home_region
        FROM night GROUP BY 1
    """)

    # Destination visits per device: dest id, first arrival, nights (distinct dates).
    con.execute("""
        CREATE TEMP TABLE dev_dest AS
        SELECT device_id, zdest(zone) AS dest,
               min(start_ts) AS first_ts,
               count(DISTINCT d) AS nights
        FROM stops WHERE zdest(zone) IS NOT NULL
        GROUP BY 1, 2
    """)

    # Pull home + destination rows (ordered by arrival) into Python.
    rows = con.execute("""
        SELECT h.device_id, h.home_region, d.dest, d.first_ts, d.nights
        FROM dev_home h JOIN dev_dest d USING (device_id)
        WHERE d.dest IS NOT NULL
        ORDER BY h.device_id, d.first_ts
    """).fetchall()
    con.close()

    DEST_R = DEST_REGION
    per_dev: dict[int, dict] = {}
    for dev, home, dest, _first_ts, nights in rows:
        rec = per_dev.setdefault(dev, {"home": home, "seq": [], "nights": {}})
        if dest not in rec["nights"]:
            rec["seq"].append(dest)  # arrival order
        rec["nights"][dest] = max(rec["nights"].get(dest, 0), int(nights))

    # Travellers: visited >=1 destination region different from home. Entry gateway is the
    # primary gateway of the FIRST away-from-home region reached (rail-friendly proxy).
    travellers = {}
    for dev, rec in per_dev.items():
        away = [d for d in rec["seq"] if DEST_R.get(d) and DEST_R.get(d) != rec["home"]]
        if not away:
            continue
        rec["away"] = away
        rec["gw"] = PRIMARY_GATEWAY.get(DEST_R[away[0]])
        travellers[dev] = rec

    return _assemble(travellers)


def _assemble(travellers: dict) -> dict:
    DEST_IDS = [d[0] for d in DESTS]
    GATE_IDS = list(GATEWAYS)

    def agg(devs: list[dict]) -> dict:
        n = len(devs)
        airport_c = Counter(r["gw"] for r in devs if r["gw"])
        dest_visitors = Counter()
        dest_nights = defaultdict(list)
        flow_c = Counter()
        itin_c = Counter()
        n_dests = []
        nights_tot = []
        multi = 0
        for r in devs:
            uniq = list(dict.fromkeys(r["away"]))
            n_dests.append(len(uniq))
            if len(uniq) >= 2:
                multi += 1
            tot_nights = 0
            for d in uniq:
                dest_visitors[d] += 1
                dest_nights[d].append(r["nights"].get(d, 0))
                tot_nights += r["nights"].get(d, 0)
                # arc originates from the destination region's own gateway
                dgw = PRIMARY_GATEWAY.get(DEST_REGION.get(d))
                if dgw:
                    flow_c[(dgw, d)] += 1
            nights_tot.append(tot_nights)
            if r["gw"] and uniq:
                itin_c[(r["gw"], tuple(uniq[:4]))] += 1
        airports = [
            {"airport": a, "arrivals": c, "share": round(c / max(n, 1), 3)}
            for a, c in airport_c.most_common() if c >= K
        ]
        destinations = [
            {"zone": d, "visitors": v, "share": round(v / max(n, 1), 3),
             "avg_nights": round(sum(dest_nights[d]) / max(len(dest_nights[d]), 1), 1)}
            for d, v in dest_visitors.most_common() if v >= K
        ]
        flows = [
            {"airport": a, "zone": d, "visitors": c}
            for (a, d), c in flow_c.most_common(16) if c >= K
        ]
        itineraries = [
            {"airport": a, "seq": list(seq), "devices": c, "share": round(c / max(n, 1), 3)}
            for (a, seq), c in itin_c.most_common(7) if c >= K
        ]
        return {
            "devices": n,
            "airports": airports,
            "destinations": destinations,
            "flows": flows,
            "itineraries": itineraries,
            "avg_destinations": round(sum(n_dests) / max(len(n_dests), 1), 2),
            "avg_nights": round(sum(nights_tot) / max(len(nights_tot), 1), 1),
            "multi_destination_share": round(multi / max(n, 1), 3),
        }

    all_devs = list(travellers.values())
    by_region: dict[str, list] = defaultdict(list)
    for r in all_devs:
        by_region[r["home"]].append(r)

    by_market = {"ALL": agg(all_devs)}
    region_codes = [rc for rc in by_region if len(by_region[rc]) >= K]
    # order origin regions by traveller volume
    region_codes.sort(key=lambda rc: -len(by_region[rc]))
    for rc in region_codes:
        by_market[rc] = agg(by_region[rc])

    # Origin-region split (replaces inbound nationality): who the domestic travellers are.
    total = len(all_devs)
    by_market_rows = [
        {"market": rc, "label": _lbl(*REGION_LABEL[rc]),
         "devices": len(by_region[rc]), "share": round(len(by_region[rc]) / max(total, 1), 3)}
        for rc in region_codes
    ]
    # trip-class split (day-trip vs overnight vs multi-region) — domestic analogue.
    day_trip = sum(1 for r in all_devs if sum(r["nights"].get(d, 0) for d in r["away"]) <= 1)
    multi_region = sum(1 for r in all_devs
                       if len({DEST_REGION.get(d) for d in r["away"]}) >= 2)
    overnight = total - day_trip
    origins = {
        "coverage": round(sum(len(v) for v in by_region.values()) / max(total, 1), 3),
        "class_counts": {"day_trip": day_trip, "overnight": overnight, "multi_region": multi_region},
        "assumed": False,
        "by_market": by_market_rows,
    }

    # market x gateway matrix (origin region -> entry gateway shares).
    matrix = []
    for rc in region_codes:
        gc = Counter(r["gw"] for r in by_region[rc] if r["gw"])
        tot = sum(gc.values()) or 1
        matrix.append({"market": rc,
                       "shares": {g: round(gc.get(g, 0) / tot, 3) for g in GATE_IDS}})

    # golden route: most common multi-stop (>=3) sequence overall.
    seq_c = Counter()
    seq_any = Counter()
    for r in all_devs:
        uniq = tuple(dict.fromkeys(r["away"]))[:4]
        if len(uniq) >= 2:
            seq_c[(r["gw"], uniq)] += 1
            seq_any[uniq] += 1
    golden = {"airport": "", "seq": [], "devices": 0, "all_airports": 0}
    if seq_c:
        (gw, seq), c = seq_c.most_common(1)[0]
        golden = {"airport": gw, "seq": list(seq), "devices": c, "all_airports": seq_any[seq]}

    # route candidates: domestic demand into a destination region via gateways.
    cand = []
    region_gateways = {reg: [g for g, (_la, _ln, r) in GATEWAYS.items() if r == reg]
                       for reg in REGION_LABEL}
    for rc in region_codes:
        devs = by_region[rc]
        # which destination regions did travellers from rc reach
        dest_region_devs = defaultdict(list)
        for r in devs:
            regs = {DEST_REGION.get(d) for d in r["away"] if DEST_REGION.get(d)}
            for dr in regs:
                if dr and dr != rc:
                    dest_region_devs[dr].append(r)
        for dr, drdevs in dest_region_devs.items():
            own_gws = set(region_gateways.get(dr, []))
            direct = sum(1 for r in drdevs if r["gw"] in own_gws)
            indirect = len(drdevs) - direct
            if len(drdevs) < K:
                continue
            via = Counter(r["gw"] for r in drdevs if r["gw"] and r["gw"] not in own_gws)
            nights = [sum(r["nights"].get(d, 0) for d in r["away"] if DEST_REGION.get(d) == dr)
                      for r in drdevs]
            cand.append({
                "market": rc, "gateway": (sorted(own_gws)[0] if own_gws else ""),
                "region": _lbl(*REGION_LABEL[dr]),
                "region_visitors": len(drdevs),
                "direct_arrivals": direct, "indirect_arrivals": indirect,
                "indirect_share": round(indirect / max(len(drdevs), 1), 3),
                "share_of_market": round(len(drdevs) / max(len(devs), 1), 3),
                "via": [{"airport": a, "devices": c} for a, c in via.most_common(2)],
                "avg_region_nights": round(sum(nights) / max(len(nights), 1), 1),
            })
    cand.sort(key=lambda x: -x["indirect_arrivals"])
    cand = cand[:12]

    return {
        "synthetic": False,
        "source": "Factori Japan mobility (domestic panel)",
        "window": _window(),
        "inbound_cohort": total,
        "cohort_definition": _lbl(
            "Domestic devices that travelled away from their home region through a gateway "
            "(airport or hub) and stayed in at least one destination region.",
            "ゲートウェイ（空港・拠点駅）を経由して居住地域外の目的地に滞在した国内デバイス。"),
        "nationality": origins,
        "airports": [{"id": gid, "label": _lbl(*_gw_label(gid)),
                      "lng": lng, "lat": lat} for gid, (lat, lng, _r) in GATEWAYS.items()],
        "destinations": [{"id": did, "label": _lbl(en, ja), "lng": lng, "lat": lat,
                          "gateways": gws} for did, en, ja, lng, lat, gws in DESTS],
        "hokkaido_zones": ["sapporo", "niseko_otaru", "furano_biei"],
        "market_airport_matrix": matrix,
        "by_market": by_market,
        "golden_route": golden,
        "route_candidates": cand,
    }


def _gw_label(gid: str) -> tuple[str, str]:
    labels = {"NRT": ("Narita", "成田"), "HND": ("Haneda", "羽田"), "KIX": ("Kansai", "関西"),
              "CTS": ("New Chitose", "新千歳"), "FUK": ("Fukuoka", "福岡"),
              "NGO": ("Chubu", "中部"), "HIJ": ("Hiroshima", "広島"), "OKA": ("Naha", "那覇")}
    return labels[gid]


def _window() -> dict:
    con = connect(read_only=True)
    r = con.execute("SELECT min(ts)::DATE, max(ts)::DATE FROM pings").fetchone()
    con.close()
    first, last = str(r[0]), str(r[1])
    days = (r[1] - r[0]).days + 1
    return {"first": first, "last": last, "days": days}


def run() -> None:
    data = build_tourism()
    APP_DATA.mkdir(parents=True, exist_ok=True)
    out = APP_DATA / "jp_tourism_readout.json"
    out.write_text(json.dumps(data, ensure_ascii=False, default=str))
    print(f"[tourism] wrote {out} ({out.stat().st_size:,} bytes); "
          f"cohort={data['inbound_cohort']:,} regions={len(data['by_market'])-1} "
          f"routes={len(data['route_candidates'])}", flush=True)


if __name__ == "__main__":
    run()
