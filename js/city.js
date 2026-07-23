// js/city.js — costruzione delle mesh della città e collisioni.
// Solo three.js + dati: nessun accesso al DOM (così è testabile in node).
import * as THREE from '../vendor/three.module.js';

// palette "pietra di Ragusa": bianchi di calce e pietra chiara d'Ibla,
// qualche nota ocra/rosa antico; tetti fra grigio e cotto spento
const WALLS = [0xe9e4d6, 0xe2dccb, 0xdcd5c2, 0xd2cbb8, 0xcfc8bb, 0xe6d9c3, 0xd8c9ae, 0xd9c2b2];
const ROOFS = [0x8a8580, 0x9b6b52, 0x7b766f, 0x8f6250, 0x6e6a63];

function rgb(hex) {
  return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
}

// Accumulatore di triangoli non indicizzati: normale piatta per faccia,
// colore per vertice. `wantN` orienta il winding in automatico.
function makeAccumulator() {
  const pos = [], nor = [], col = [];
  return {
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, wnx, wny, wnz, c) {
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * wnx + ny * wny + nz * wnz < 0) {
        [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; [bz, cz] = [cz, bz];
        nx = -nx; ny = -ny; nz = -nz;
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      for (let i = 0; i < 3; i++) { nor.push(nx, ny, nz); col.push(c.r, c.g, c.b); }
    },
    toMesh(material) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return new THREE.Mesh(g, material);
    },
  };
}

// Edificio = prisma: pareti laterali + tetto triangolato. b = [h, x1, z1, x2, z2, ...]
function addBuilding(acc, b, wallColors, roofColors, idx) {
  const h = b[0];
  const poly = b.slice(1);
  const n = poly.length / 2;
  if (n < 3) return;

  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += poly[2 * i]; cz += poly[2 * i + 1]; }
  cx /= n; cz /= n;

  const wall = wallColors[idx % wallColors.length];
  const roof = roofColors[idx % roofColors.length];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = poly[2 * i], z1 = poly[2 * i + 1];
    const x2 = poly[2 * j], z2 = poly[2 * j + 1];
    // normale orizzontale verso l'esterno (test contro il baricentro)
    let nx = z2 - z1, nz = -(x2 - x1);
    const mx = (x1 + x2) / 2 - cx, mz = (z1 + z2) / 2 - cz;
    if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    acc.tri(x1, 0, z1, x2, 0, z2, x2, h, z2, nx, 0, nz, wall);
    acc.tri(x1, 0, z1, x2, h, z2, x1, h, z2, nx, 0, nz, wall);
  }

  const contour = [];
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(poly[2 * i], poly[2 * i + 1]));
  let tris = [];
  try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tris = []; }
  for (const [a, b2, c2] of tris) {
    acc.tri(
      contour[a].x, h, contour[a].y,
      contour[b2].x, h, contour[b2].y,
      contour[c2].x, h, contour[c2].y,
      0, 1, 0, roof
    );
  }
}

// Strada = nastro triangolare lungo la polilinea. r = [larghezza, x1, z1, ...]
function addRoad(acc, r, idx) {
  const hw = r[0] / 2;
  const pts = r.slice(1);
  const n = pts.length / 2;
  if (n < 2) return;
  const shade = 0.3 + (idx % 5) * 0.015;
  const c = { r: shade, g: shade, b: shade + 0.02 };
  const Y = 0.06;

  const norm = (i) => {
    const pi = Math.max(0, i - 1), ni = Math.min(n - 1, i + 1);
    const dx = pts[2 * ni] - pts[2 * pi], dz = pts[2 * ni + 1] - pts[2 * pi + 1];
    const l = Math.hypot(dx, dz) || 1;
    return [-dz / l * hw, dx / l * hw];
  };
  for (let i = 0; i < n - 1; i++) {
    const [n1x, n1z] = norm(i), [n2x, n2z] = norm(i + 1);
    const x1 = pts[2 * i], z1 = pts[2 * i + 1];
    const x2 = pts[2 * i + 2], z2 = pts[2 * i + 3];
    acc.tri(x1 + n1x, Y, z1 + n1z, x1 - n1x, Y, z1 - n1z, x2 + n2x, Y, z2 + n2z, 0, 1, 0, c);
    acc.tri(x1 - n1x, Y, z1 - n1z, x2 - n2x, Y, z2 - n2z, x2 + n2x, Y, z2 + n2z, 0, 1, 0, c);
  }
}

// Piazza = poligono piatto in pietra chiara. p = [x1, z1, ...]
function addPlaza(acc, p, idx) {
  const n = p.length / 2;
  if (n < 3) return;
  const base = 0.78 + (idx % 3) * 0.03;
  const c = { r: base, g: base * 0.96, b: base * 0.87 };
  const Y = 0.035;
  const contour = [];
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[2 * i], p[2 * i + 1]));
  let tris = [];
  try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tris = []; }
  for (const [a, b2, c2] of tris) {
    acc.tri(
      contour[a].x, Y, contour[a].y,
      contour[b2].x, Y, contour[b2].y,
      contour[c2].x, Y, contour[c2].y,
      0, 1, 0, c
    );
  }
}

export function makeGeoConverter(center) {
  const [lat0, lon0] = center;
  const k = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return (lat, lon) => [(lon - lon0) * k, -(lat - lat0) * 111320];
}

function insidePoly(p, x, z) {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Griglia spaziale dei poligoni degli edifici, con risoluzione di un cerchio
// (la moto) contro i muri: restituisce la posizione corretta e se c'è stato urto.
export class Colliders {
  constructor(buildings, cell = 24) {
    this.cell = cell;
    this.grid = new Map();
    for (const b of buildings) {
      const poly = b.slice(1);
      let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
      for (let i = 0; i < poly.length; i += 2) {
        if (poly[i] < minx) minx = poly[i];
        if (poly[i] > maxx) maxx = poly[i];
        if (poly[i + 1] < minz) minz = poly[i + 1];
        if (poly[i + 1] > maxz) maxz = poly[i + 1];
      }
      const rec = { poly, minx, minz, maxx, maxz };
      for (let cx = Math.floor((minx - 2) / cell); cx <= Math.floor((maxx + 2) / cell); cx++) {
        for (let cz = Math.floor((minz - 2) / cell); cz <= Math.floor((maxz + 2) / cell); cz++) {
          const k = (cx + 4096) * 8192 + (cz + 4096);
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(rec);
        }
      }
    }
  }

  resolve(x, z, r) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const arr = this.grid.get((ix + 4096) * 8192 + (iz + 4096));
          if (!arr) continue;
          for (const rec of arr) {
            if (x < rec.minx - r || x > rec.maxx + r || z < rec.minz - r || z > rec.maxz + r) continue;
            const p = rec.poly, n = p.length / 2;
            let best = Infinity, bx = 0, bz = 0;
            for (let i = 0; i < n; i++) {
              const j = (i + 1) % n;
              const ax = p[2 * i], az = p[2 * i + 1];
              const dx = p[2 * j] - ax, dz = p[2 * j + 1] - az;
              const len2 = dx * dx + dz * dz;
              let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
              t = Math.max(0, Math.min(1, t));
              const qx = ax + t * dx, qz = az + t * dz;
              const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
              if (d2 < best) { best = d2; bx = qx; bz = qz; }
            }
            const d = Math.sqrt(best);
            if (d < r) {
              hit = true;
              const nx = d > 1e-4 ? (x - bx) / d : 1;
              const nz = d > 1e-4 ? (z - bz) / d : 0;
              const s = insidePoly(p, x, z) ? -1 : 1; // se siamo dentro, spingi fuori
              x = bx + s * nx * r;
              z = bz + s * nz * r;
            }
          }
        }
      }
    }
    return { x, z, hit };
  }
}

// Punto stradale più vicino a (x, z): usato per lo spawn della moto.
export function nearestRoadPoint(roads, x, z) {
  let best = Infinity, bx = x, bz = z, angle = 0;
  for (const road of roads) {
    for (let i = 1; i < road.length; i += 2) {
      const px = road[i], pz = road[i + 1];
      const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d2 < best) {
        best = d2; bx = px; bz = pz;
        const pi = Math.max(1, i - 2), ni = Math.min(road.length - 2, i + 2);
        angle = Math.atan2(road[ni] - road[pi], road[ni + 1] - road[pi + 1]);
      }
    }
  }
  return { x: bx, z: bz, angle, dist: Math.sqrt(best) };
}

export function buildCity(data) {
  const group = new THREE.Group();
  const wallColors = WALLS.map(rgb);
  const roofColors = ROOFS.map(rgb);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4600, 4600),
    new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

  const bAcc = makeAccumulator();
  data.buildings.forEach((b, i) => addBuilding(bAcc, b, wallColors, roofColors, i));
  group.add(bAcc.toMesh(mat()));

  const rAcc = makeAccumulator();
  data.roads.forEach((r, i) => addRoad(rAcc, r, i));
  group.add(rAcc.toMesh(mat()));

  const pAcc = makeAccumulator();
  data.plazas.forEach((p, i) => addPlaza(pAcc, p, i));
  group.add(pAcc.toMesh(mat()));

  return {
    group,
    colliders: new Colliders(data.buildings),
    counts: {
      buildings: data.buildings.length,
      roads: data.roads.length,
      plazas: data.plazas.length,
    },
  };
}
