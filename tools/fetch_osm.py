#!/usr/bin/env python3
"""Scarica vie ed edifici del centro di Ragusa da OpenStreetMap (Overpass API)
e li converte in data/city.json in coordinate metriche locali (x = est, z = sud).

Nessuna dipendenza esterna: solo libreria standard.
"""
import json
import math
import os
import sys
import urllib.parse
import urllib.request

BBOX = (36.918, 14.717, 36.936, 14.748)  # S, W, N, E — Ragusa Superiore + Ibla (fino al Duomo)

# Monumenti da includere anche se in OSM non sono taggati sulla way:
# (nome, lat, lon) — abbinato all'edificio che contiene il punto (o al più vicino)
EXTRA_MONUMENTS = [
    ("Duomo di San Giorgio", 36.926547, 14.742300),
]
MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
QUERY = """[out:json][timeout:180];
(
  way["building"]({s},{w},{n},{e});
  way["highway"]({s},{w},{n},{e});
  way["historic"]["name"]["building"]({s},{w},{n},{e});
  way["tourism"="attraction"]["name"]["building"]({s},{w},{n},{e});
  way["amenity"="place_of_worship"]["name"]["building"]({s},{w},{n},{e});
);
out geom;"""

ROAD_WIDTH = {
    "motorway": 12.0, "trunk": 12.0, "primary": 9.0, "secondary": 7.5,
    "tertiary": 6.5, "residential": 5.5, "unclassified": 5.5,
    "living_street": 4.0, "service": 4.0, "pedestrian": 4.0,
    "track": 3.5, "footway": 2.5, "cycleway": 2.5, "path": 2.5,
}
SKIP_HIGHWAY = {"steps", "construction", "proposed", "raceway", "corridor", "elevator"}

S, W, N, E = BBOX
LAT0, LON0 = (S + N) / 2.0, (W + E) / 2.0
M_PER_DEG_LAT = 111320.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "city.json")


def to_local(lat, lon):
    """Coordinate metriche locali: x verso est, z verso sud (nord = -z)."""
    return (lon - LON0) * M_PER_DEG_LON, -(lat - LAT0) * M_PER_DEG_LAT


def simplify(pts, min_dist, closed=False):
    """Riduce i punti di una polilinea: distanza minima + rimozione quasi-collineari."""
    out = []
    for p in pts:
        if not out or math.dist(p, out[-1]) >= min_dist:
            out.append(p)
    if closed and len(out) > 2 and math.dist(out[0], out[-1]) < min_dist:
        out.pop()
    if len(out) <= (3 if closed else 2):
        return out
    keep = []
    n = len(out)
    idxs = range(n) if closed else range(1, n - 1)
    drop = set()
    for i in idxs:
        a, b, c = out[i - 1], out[i], out[(i + 1) % n]
        cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        seg = math.dist(a, c)
        if seg > 0 and abs(cross) / seg < 0.15:
            drop.add(i)
    return [p for i, p in enumerate(out) if i not in drop]


def building_height(tags, wid):
    h = tags.get("height")
    if h:
        try:
            return max(3.0, min(60.0, float(str(h).replace(",", ".").rstrip("m "))))
        except ValueError:
            pass
    lv = tags.get("building:levels")
    if lv:
        try:
            return max(3.0, min(60.0, float(lv) * 3.2))
        except ValueError:
            pass
    return 6.5 + (wid % 4) * 2.2  # 2-5 piani, deterministico


def point_in_poly(flat, x, z):
    inside = False
    n = len(flat) // 2
    j = n - 1
    for i in range(n):
        xi, zi = flat[2 * i], flat[2 * i + 1]
        xj, zj = flat[2 * j], flat[2 * j + 1]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def is_monument(tags):
    """Edifici 'monumento': chiese, attrazioni turistiche, edifici storici con nome."""
    if "name" not in tags or "building" not in tags:
        return False
    return (
        "historic" in tags
        or tags.get("tourism") == "attraction"
        or tags.get("amenity") == "place_of_worship"
        or tags.get("building") in ("church", "cathedral", "basilica", "chapel")
    )


def fetch():
    q = QUERY.format(s=S, w=W, n=N, e=E)
    body = urllib.parse.urlencode({"data": q}).encode()
    for m in MIRRORS:
        try:
            print(f"scarico da {m} ...", flush=True)
            req = urllib.request.Request(
                m, data=body, headers={"User-Agent": "micheluccio-ragusa/1.0"}
            )
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.load(r)
        except Exception as ex:  # noqa: BLE001 — prova il mirror successivo
            print(f"  fallito: {ex}", file=sys.stderr)
    sys.exit("Tutti i mirror Overpass hanno fallito. Riprova tra poco.")


def main():
    raw = fetch()
    elements = raw.get("elements", [])
    print(f"elementi ricevuti: {len(elements)}")

    buildings, roads, plazas, monuments = [], [], [], []
    for el in elements:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        pts = [to_local(g["lat"], g["lon"]) for g in el["geometry"]]

        if "building" in tags and tags["building"] != "no":
            poly = simplify(pts, 1.2, closed=True)
            if len(poly) >= 3:
                h = round(building_height(tags, el["id"]), 1)
                flat = [round(v, 1) for p in poly for v in p]
                buildings.append([h] + flat)
                if is_monument(tags):
                    prio = (
                        0 if "historic" in tags
                        else 1 if tags.get("tourism") == "attraction"
                        else 2
                    )
                    monuments.append({"n": tags["name"], "h": h, "p": flat, "prio": prio})
        elif "highway" in tags:
            hw = tags["highway"]
            if hw in SKIP_HIGHWAY:
                continue
            if tags.get("area") == "yes" or "plaza" in hw or "square" in hw:
                poly = simplify(pts, 1.5, closed=True)
                if len(poly) >= 3:
                    plazas.append([round(v, 1) for p in poly for v in p])
            else:
                line = simplify(pts, 2.0)
                if len(line) >= 2:
                    width = ROAD_WIDTH.get(hw, 4.0)
                    flat = [round(v, 1) for p in line for v in p]
                    roads.append([width] + flat)

    # monumenti "manuali": abbinati all'edificio che contiene il punto noto
    for name, lat, lon in EXTRA_MONUMENTS:
        existing = next((m for m in monuments if m["n"] == name), None)
        if existing is not None:
            existing["prio"] = 0  # priorità massima: mai tagliato fuori
            continue
        x, z = to_local(lat, lon)
        best = None
        for b in buildings:
            if point_in_poly(b[1:], x, z):
                best = b
                break
        if best is None:  # fallback: baricentro più vicino entro 45 m
            dist_best = 45.0
            for b in buildings:
                poly = b[1:]
                n = len(poly) // 2
                bx = sum(poly[0::2]) / n
                bz = sum(poly[1::2]) / n
                d = math.hypot(bx - x, bz - z)
                if d < dist_best:
                    dist_best, best = d, b
        if best is not None:
            monuments.append({"n": name, "h": best[0], "p": best[1:], "prio": 0})
        else:
            print(f"  ! {name}: nessun edificio trovato vicino a ({lat}, {lon})")

    monuments.sort(key=lambda m: (m["prio"], m["n"]))
    monuments = [{"n": m["n"], "h": m["h"], "p": m["p"]} for m in monuments[:16]]

    city = {
        "center": [LAT0, LON0],
        "bbox": [S, W, N, E],
        "buildings": buildings,
        "roads": roads,
        "plazas": plazas,
        "monuments": monuments,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(city, f, separators=(",", ":"))

    size_kb = os.path.getsize(OUT) / 1024
    print(f"edifici: {len(buildings)}  strade: {len(roads)}  piazze: {len(plazas)}  monumenti: {len(monuments)}")
    for m in monuments:
        print(f"  - {m['n']} ({m['h']}m)")
    print(f"scritto {OUT} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
