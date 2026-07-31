"""Build a lightweight GeoJSON boundary catalog for the climate lab map."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json"
OUTPUT = ROOT / "public/data/climate/admin-boundaries.geojson"


def perpendicular_distance(point, start, end):
    if start == end:
        return ((point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2) ** 0.5
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / (dx * dx + dy * dy) ** 0.5


def simplify_ring(ring, tolerance=0.00035):
    if len(ring) <= 5:
        return ring
    closed = ring[0] == ring[-1]
    points = ring[:-1] if closed else ring

    def rdp(segment):
        if len(segment) <= 2:
            return segment
        start, end = segment[0], segment[-1]
        distances = [perpendicular_distance(point, start, end) for point in segment[1:-1]]
        if not distances or max(distances) <= tolerance:
            return [start, end]
        index = distances.index(max(distances)) + 1
        return rdp(segment[: index + 1])[:-1] + rdp(segment[index:])

    simplified = rdp(points)
    if closed:
        simplified.append(simplified[0])
    return [[round(point[0], 5), round(point[1], 5)] for point in simplified]


def simplify_geometry(geometry):
    if geometry["type"] == "Polygon":
        coordinates = [simplify_ring(ring) for ring in geometry["coordinates"]]
    else:
        coordinates = [[simplify_ring(ring) for ring in polygon] for polygon in geometry["coordinates"]]
    return {"type": geometry["type"], "coordinates": coordinates}


def main():
    document = json.loads(SOURCE.read_text(encoding="utf-8"))
    features = []
    for code, feature in document["featuresByCode"].items():
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "code": code,
                    "name": feature["properties"].get("sig_kor_nm", ""),
                },
                "geometry": simplify_geometry(feature["geometry"]),
            }
        )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"written {OUTPUT} ({OUTPUT.stat().st_size:,} bytes, {len(features)} features)")


if __name__ == "__main__":
    main()
