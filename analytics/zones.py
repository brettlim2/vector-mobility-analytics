"""Japan zone reference: named area centroids for labelling aggregates.

Approximate centroids of major metropolitan activity centres (Tokyo wards and
regional city cores). Labelling is nearest-centroid, which is adequate at the
~1-2 km scale used for zone-level aggregates (not parcel-accurate geocoding).
"""

# (name, lat, lng, kind)  kind: cbd | residential | industrial | airport | leisure | education | transport
ZONES: list[tuple[str, float, float, str]] = [
    # --- Tokyo 23 wards & core ---
    ("Marunouchi / Tokyo Stn", 35.6812, 139.7671, "cbd"),
    ("Otemachi / Chiyoda", 35.6876, 139.7639, "cbd"),
    ("Nihonbashi / Chuo", 35.6833, 139.7745, "cbd"),
    ("Ginza", 35.6717, 139.7650, "leisure"),
    ("Shimbashi / Shiodome", 35.6665, 139.7583, "cbd"),
    ("Minato / Roppongi", 35.6628, 139.7315, "cbd"),
    ("Toranomon / Kasumigaseki", 35.6702, 139.7490, "cbd"),
    ("Shinagawa", 35.6285, 139.7389, "cbd"),
    ("Shinjuku", 35.6896, 139.7006, "cbd"),
    ("Shibuya", 35.6580, 139.7016, "cbd"),
    ("Harajuku / Omotesando", 35.6702, 139.7027, "leisure"),
    ("Ikebukuro / Toshima", 35.7295, 139.7109, "cbd"),
    ("Ueno / Taito", 35.7138, 139.7770, "leisure"),
    ("Asakusa", 35.7148, 139.7967, "leisure"),
    ("Akihabara", 35.6984, 139.7731, "leisure"),
    ("Tokyo Skytree / Sumida", 35.7101, 139.8107, "leisure"),
    ("Odaiba / Koto", 35.6297, 139.7797, "leisure"),
    ("Bunkyo / Hongo", 35.7081, 139.7620, "education"),
    ("Nakano", 35.7056, 139.6659, "residential"),
    ("Setagaya", 35.6465, 139.6530, "residential"),
    ("Kichijoji / Musashino", 35.7030, 139.5800, "residential"),
    ("Tachikawa", 35.6939, 139.4137, "residential"),
    ("Machida", 35.5423, 139.4466, "residential"),
    # --- Greater Tokyo (Kanto) ---
    ("Yokohama / Minato Mirai", 35.4568, 139.6316, "cbd"),
    ("Shin-Yokohama", 35.5090, 139.6174, "transport"),
    ("Kawasaki", 35.5309, 139.6970, "cbd"),
    ("Saitama / Omiya", 35.9065, 139.6238, "cbd"),
    ("Chiba", 35.6130, 140.1130, "cbd"),
    ("Tokyo Disney / Maihama", 35.6329, 139.8804, "leisure"),
    ("Makuhari", 35.6480, 140.0340, "cbd"),
    ("Haneda Airport", 35.5494, 139.7798, "airport"),
    ("Narita Airport", 35.7720, 140.3929, "airport"),
    ("Tsukuba", 36.0835, 140.0764, "education"),
    # --- Kansai ---
    ("Osaka Umeda / Kita", 34.7025, 135.4959, "cbd"),
    ("Osaka Namba / Minami", 34.6660, 135.5010, "leisure"),
    ("Shin-Osaka", 34.7336, 135.5003, "transport"),
    ("Osaka Bay / USJ", 34.6658, 135.4323, "leisure"),
    ("Tennoji / Abeno", 34.6456, 135.5136, "cbd"),
    ("Kyoto Station", 34.9858, 135.7588, "transport"),
    ("Kyoto Downtown / Gion", 35.0037, 135.7681, "leisure"),
    ("Kobe Sannomiya", 34.6946, 135.1977, "cbd"),
    ("Kansai Airport", 34.4347, 135.2440, "airport"),
    ("Nara", 34.6851, 135.8049, "leisure"),
    # --- Chubu / Nagoya ---
    ("Nagoya Station / Meieki", 35.1709, 136.8815, "cbd"),
    ("Nagoya Sakae", 35.1707, 136.9082, "leisure"),
    ("Chubu Centrair Airport", 34.8584, 136.8048, "airport"),
    # --- Other major metros ---
    ("Fukuoka Hakata", 33.5902, 130.4207, "cbd"),
    ("Fukuoka Tenjin", 33.5914, 130.3990, "cbd"),
    ("Fukuoka Airport", 33.5859, 130.4510, "airport"),
    ("Sapporo", 43.0686, 141.3508, "cbd"),
    ("New Chitose Airport", 42.7752, 141.6923, "airport"),
    ("Sendai", 38.2601, 140.8824, "cbd"),
    ("Hiroshima", 34.3975, 132.4756, "cbd"),
    ("Okayama", 34.6657, 133.9183, "cbd"),
    ("Kanazawa", 36.5780, 136.6486, "cbd"),
    ("Niigata", 37.9122, 139.0618, "cbd"),
    ("Naha / Okinawa", 26.2124, 127.6809, "leisure"),
]


def zones_sql_values() -> str:
    """VALUES clause for loading the zone table into DuckDB."""
    rows = ", ".join(
        f"('{name.replace(chr(39), chr(39) * 2)}', {lat}, {lng}, '{kind}')"
        for name, lat, lng, kind in ZONES
    )
    return f"(VALUES {rows}) AS z(zone, zlat, zlng, kind)"
