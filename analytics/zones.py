"""Singapore zone reference: named area centroids for labelling aggregates.

Approximate centroids of planning areas / well-known activity centres.
Labelling is nearest-centroid, which is adequate at the ~1-2 km scale used
for zone-level aggregates (not parcel-accurate geocoding).
"""

# (name, lat, lng, kind)  kind: cbd | residential | industrial | airport | leisure | education | transport
SG_ZONES: list[tuple[str, float, float, str]] = [
    ("Raffles Place / CBD", 1.2841, 103.8511, "cbd"),
    ("Marina Bay", 1.2822, 103.8585, "cbd"),
    ("Tanjong Pagar", 1.2764, 103.8459, "cbd"),
    ("Chinatown", 1.2838, 103.8443, "cbd"),
    ("Clarke Quay / River Valley", 1.2906, 103.8465, "leisure"),
    ("Bugis", 1.2998, 103.8554, "cbd"),
    ("Orchard", 1.3040, 103.8318, "leisure"),
    ("Newton", 1.3138, 103.8388, "residential"),
    ("Novena", 1.3203, 103.8439, "residential"),
    ("Little India", 1.3066, 103.8518, "leisure"),
    ("Kallang", 1.3100, 103.8714, "residential"),
    ("Geylang", 1.3201, 103.8918, "residential"),
    ("Paya Lebar", 1.3177, 103.8926, "cbd"),
    ("Marine Parade / Katong", 1.3020, 103.8971, "residential"),
    ("East Coast", 1.3008, 103.9122, "leisure"),
    ("Bedok", 1.3240, 103.9300, "residential"),
    ("Tampines", 1.3546, 103.9437, "residential"),
    ("Pasir Ris", 1.3721, 103.9474, "residential"),
    ("Changi Airport", 1.3644, 103.9915, "airport"),
    ("Changi Business Park / Expo", 1.3345, 103.9633, "cbd"),
    ("Loyang", 1.3671, 103.9740, "industrial"),
    ("Punggol", 1.4051, 103.9025, "residential"),
    ("Sengkang", 1.3911, 103.8950, "residential"),
    ("Hougang", 1.3712, 103.8863, "residential"),
    ("Serangoon", 1.3554, 103.8679, "residential"),
    ("Ang Mo Kio", 1.3691, 103.8454, "residential"),
    ("Bishan", 1.3508, 103.8484, "residential"),
    ("Toa Payoh", 1.3343, 103.8563, "residential"),
    ("Yishun", 1.4295, 103.8355, "residential"),
    ("Sembawang", 1.4491, 103.8185, "residential"),
    ("Seletar", 1.4131, 103.8672, "industrial"),
    ("Woodlands", 1.4382, 103.7890, "residential"),
    ("Woodlands Checkpoint", 1.4437, 103.7691, "transport"),
    ("Kranji", 1.4250, 103.7620, "industrial"),
    ("Mandai", 1.4043, 103.7900, "leisure"),
    ("Bukit Panjang", 1.3774, 103.7719, "residential"),
    ("Choa Chu Kang", 1.3840, 103.7470, "residential"),
    ("Tengah", 1.3550, 103.7300, "residential"),
    ("Bukit Batok", 1.3590, 103.7637, "residential"),
    ("Bukit Timah", 1.3294, 103.8021, "residential"),
    ("Jurong East", 1.3331, 103.7430, "cbd"),
    ("Jurong West", 1.3404, 103.7090, "residential"),
    ("NTU / Pioneer", 1.3483, 103.6831, "education"),
    ("Tuas", 1.3200, 103.6500, "industrial"),
    ("Tuas Checkpoint", 1.3480, 103.6360, "transport"),
    ("Jurong Island", 1.2660, 103.6990, "industrial"),
    ("Clementi", 1.3151, 103.7652, "residential"),
    ("NUS / Kent Ridge", 1.2966, 103.7764, "education"),
    ("One-North / Buona Vista", 1.2996, 103.7877, "cbd"),
    ("Holland Village", 1.3110, 103.7961, "leisure"),
    ("Queenstown", 1.2942, 103.7861, "residential"),
    ("Tiong Bahru", 1.2859, 103.8320, "residential"),
    ("Bukit Merah", 1.2819, 103.8239, "residential"),
    ("Alexandra / Labrador", 1.2735, 103.8017, "cbd"),
    ("Pasir Panjang", 1.2761, 103.7916, "industrial"),
    ("HarbourFront", 1.2653, 103.8220, "leisure"),
    ("Sentosa", 1.2494, 103.8303, "leisure"),
    ("Lim Chu Kang", 1.4300, 103.7170, "industrial"),
]


def zones_sql_values() -> str:
    """VALUES clause for loading the zone table into DuckDB."""
    rows = ", ".join(
        f"('{name.replace(chr(39), chr(39) * 2)}', {lat}, {lng}, '{kind}')"
        for name, lat, lng, kind in SG_ZONES
    )
    return f"(VALUES {rows}) AS z(zone, zlat, zlng, kind)"
