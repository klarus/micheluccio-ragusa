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
// colore per vertice, UV opzionali. `wantN` orienta il winding in automatico.
function makeAccumulator() {
  const pos = [], nor = [], col = [], uv = [];
  return {
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, wnx, wny, wnz, c, uvs = null) {
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * wnx + ny * wny + nz * wnz < 0) {
        [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; [bz, cz] = [cz, bz];
        nx = -nx; ny = -ny; nz = -nz;
        if (uvs) [uvs[1], uvs[2]] = [uvs[2], uvs[1]];
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      for (let i = 0; i < 3; i++) { nor.push(nx, ny, nz); col.push(c.r, c.g, c.b); }
      if (uvs) uv.push(uvs[0][0], uvs[0][1], uvs[1][0], uvs[1][1], uvs[2][0], uvs[2][1]);
      else uv.push(0, 0, 0, 0, 0, 0);
    },
    toMesh(material) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return new THREE.Mesh(g, material);
    },
  };
}

// punto interno al poligono: baricentro se cade dentro, altrimenti scansione a griglia
// (il baricentro dei poligoni concavi — cortili, edifici a L — può cadere fuori)
function interiorPoint(p) {
  const n = p.length / 2;
  let cx = 0, cz = 0, minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (let i = 0; i < n; i++) {
    const X = p[2 * i], Z = p[2 * i + 1];
    cx += X; cz += Z;
    if (X < minx) minx = X;
    if (X > maxx) maxx = X;
    if (Z < minz) minz = Z;
    if (Z > maxz) maxz = Z;
  }
  cx /= n; cz /= n;
  if (insidePoly(p, cx, cz)) return [cx, cz];
  for (let gx = minx + 0.8; gx < maxx; gx += 1.5) {
    for (let gz = minz + 0.8; gz < maxz; gz += 1.5) {
      if (insidePoly(p, gx, gz)) return [gx, gz];
    }
  }
  return [cx, cz];
}

const TILE_M = 6; // metri coperti da una ripetizione della texture delle finestre

// Edificio = prisma: pareti laterali (UV per la texture finestre) + tetto con
// fascia di parapetto. b = [h, x1, z1, x2, z2, ...]
function addBuilding(acc, b, wallColors, roofColors, idx) {
  const h = b[0];
  // toglie punti consecutivi (quasi) duplicati: l'arrotondamento del fetch può crearne
  const raw = b.slice(1);
  const poly = [];
  for (let i = 0; i < raw.length; i += 2) {
    const k = poly.length;
    if (k === 0 || Math.hypot(raw[i] - poly[k - 2], raw[i + 1] - poly[k - 1]) > 0.05) {
      poly.push(raw[i], raw[i + 1]);
    }
  }
  const n = poly.length / 2;
  if (n < 3) return;

  const [cx, cz] = interiorPoint(poly);
  const wall = wallColors[idx % wallColors.length];
  const roof = roofColors[idx % roofColors.length];
  const band = { r: wall.r * 0.82, g: wall.g * 0.82, b: wall.b * 0.82 };

  let u = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = poly[2 * i], z1 = poly[2 * i + 1];
    const x2 = poly[2 * j], z2 = poly[2 * j + 1];
    // normale orizzontale verso l'esterno (test contro un punto interno)
    let nx = z2 - z1, nz = -(x2 - x1);
    const mx = (x1 + x2) / 2 - cx, mz = (z1 + z2) / 2 - cz;
    if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const edge = Math.hypot(x2 - x1, z2 - z1);
    const u0 = u / TILE_M, u1 = (u + edge) / TILE_M, v1 = h / TILE_M;
    acc.tri(x1, 0, z1, x2, 0, z2, x2, h, z2, nx, 0, nz, wall, [[u0, 0], [u1, 0], [u1, v1]]);
    acc.tri(x1, 0, z1, x2, h, z2, x1, h, z2, nx, 0, nz, wall, [[u0, 0], [u1, v1], [u0, v1]]);
    u += edge;
  }

  const contour = [];
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(poly[2 * i], poly[2 * i + 1]));
  // fascia di parapetto: anello tra il bordo e il poligono rientrato al 4%
  const inset = contour.map((v) => new THREE.Vector2(v.x + (cx - v.x) * 0.04, v.y + (cz - v.y) * 0.04));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    acc.tri(
      contour[i].x, h, contour[i].y, contour[j].x, h, contour[j].y, inset[j].x, h, inset[j].y,
      0, 1, 0, band
    );
    acc.tri(
      contour[i].x, h, contour[i].y, inset[j].x, h, inset[j].y, inset[i].x, h, inset[i].y,
      0, 1, 0, band
    );
  }
  let tris = [];
  try { tris = THREE.ShapeUtils.triangulateShape(inset, []); } catch { tris = []; }
  for (const [a, b2, c2] of tris) {
    acc.tri(
      inset[a].x, h, inset[a].y,
      inset[b2].x, h, inset[b2].y,
      inset[c2].x, h, inset[c2].y,
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
  const shade = 0.27 + (idx % 5) * 0.015;
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

export function insidePoly(p, x, z) {
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
      const rec = { poly, minx, minz, maxx, maxz, h: b[0] };
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

  resolve(x, z, r, y = 0) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const arr = this.grid.get((ix + 4096) * 8192 + (iz + 4096));
          if (!arr) continue;
          for (const rec of arr) {
            if (rec.h <= y + 0.5) continue; // sopra il tetto: niente collisione
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

// ---- monumenti: rampa d'accesso al tetto e quota del terreno

// Cuneo (rampa): da (x0,z0) a terra, sale lungo (dx,dz) per L, larga W, alta h in cima.
function addRamp(acc, r, c) {
  const px = -r.dz, pz = r.dx; // perpendicolare
  const ax = r.x0 - (px * r.W) / 2, az = r.z0 - (pz * r.W) / 2; // basso sx
  const bx = r.x0 + (px * r.W) / 2, bz = r.z0 + (pz * r.W) / 2; // basso dx
  const cx = r.x0 + r.dx * r.L - (px * r.W) / 2, cz = r.z0 + r.dz * r.L - (pz * r.W) / 2; // alto sx
  const ex = r.x0 + r.dx * r.L + (px * r.W) / 2, ez = r.z0 + r.dz * r.L + (pz * r.W) / 2; // alto dx
  // piano inclinato
  acc.tri(ax, 0, az, bx, 0, bz, ex, r.h, ez, 0, 1, 0, c);
  acc.tri(ax, 0, az, ex, r.h, ez, cx, r.h, cz, 0, 1, 0, c);
  // fiancate laterali
  acc.tri(ax, 0, az, cx, r.h, cz, cx, 0, cz, -px, 0, -pz, c);
  acc.tri(bx, 0, bz, ex, r.h, ez, ex, 0, ez, px, 0, pz, c);
  // parete di fondo (in cima)
  acc.tri(cx, 0, cz, ex, 0, ez, ex, r.h, ez, r.dx, 0, r.dz, c);
  acc.tri(cx, 0, cz, ex, r.h, ez, cx, r.h, cz, r.dx, 0, r.dz, c);
}

// Per ogni monumento: baricentro, AABB e la rampa sul lato con più spazio libero.
export function makeMonuments(data, colliders) {
  const monuments = [];
  for (const m of data.monuments || []) {
    const p = m.p, n = p.length / 2;
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (let i = 0; i < n; i++) {
      const X = p[2 * i], Z = p[2 * i + 1];
      if (X < minx) minx = X;
      if (X > maxx) maxx = X;
      if (Z < minz) minz = Z;
      if (Z > maxz) maxz = Z;
    }
    const acx = (minx + maxx) / 2, acz = (minz + maxz) / 2;
    const sides = [
      { ex: maxx, ez: acz, dx: 1, dz: 0, len: maxz - minz },  // est
      { ex: minx, ez: acz, dx: -1, dz: 0, len: maxz - minz }, // ovest
      { ex: acx, ez: maxz, dx: 0, dz: 1, len: maxx - minx },  // sud
      { ex: acx, ez: minz, dx: 0, dz: -1, len: maxx - minx }, // nord
    ];
    let best = sides[0], bestClear = -1;
    for (const s of sides) {
      let clear = 20;
      for (let d = 3; d <= 18; d += 3) {
        if (colliders.resolve(s.ex + s.dx * d, s.ez + s.dz * d, 1.4).hit) { clear = d - 3; break; }
      }
      if (clear > bestClear) { bestClear = clear; best = s; }
    }
    const L = Math.max(6, Math.min(18, m.h * 1.3)) + 0.8; // la cima entra un po' nell'edificio
    const W = Math.max(3, Math.min(6, best.len * 0.9));
    const [icx, icz] = interiorPoint(p);
    monuments.push({
      name: m.n, h: m.h, p, cx: icx, cz: icz,
      ramp: {
        x0: best.ex + best.dx * (L - 0.8), z0: best.ez + best.dz * (L - 0.8),
        dx: -best.dx, dz: -best.dz, L, W, h: m.h,
      },
    });
  }
  return monuments;
}

// Quota del terreno in (x,z) dato che la moto è a quota y: strade a 0,
// piano inclinato sulle rampe, tetto sui monumenti (se sei già quasi su).
export function makeGround(monuments) {
  return (x, z, y) => {
    let g = 0;
    for (const m of monuments) {
      const r = m.ramp;
      const rx = x - r.x0, rz = z - r.z0;
      const s = rx * r.dx + rz * r.dz;
      if (s >= 0 && s <= r.L) {
        const t = rx * -r.dz + rz * r.dx;
        if (Math.abs(t) <= r.W / 2) {
          const hh = r.h * (s / r.L);
          if (hh > g) g = hh;
        }
      }
      if (y > m.h - 1.2 && insidePoly(m.p, x, z) && m.h > g) g = m.h;
    }
    return g;
  };
}

export function buildCity(data, opts = {}) {
  const group = new THREE.Group();
  const wallColors = WALLS.map(rgb);
  const roofColors = ROOFS.map(rgb);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4600, 4600),
    new THREE.MeshStandardMaterial({ color: 0xa5a196, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

  const bAcc = makeAccumulator();
  data.buildings.forEach((b, i) => addBuilding(bAcc, b, wallColors, roofColors, i));
  const bMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    ...(opts.wallTexture ? { map: opts.wallTexture } : {}),
  });
  group.add(bAcc.toMesh(bMat));

  const rAcc = makeAccumulator();
  data.roads.forEach((r, i) => addRoad(rAcc, r, i));
  group.add(rAcc.toMesh(mat()));

  const pAcc = makeAccumulator();
  data.plazas.forEach((p, i) => addPlaza(pAcc, p, i));
  group.add(pAcc.toMesh(mat()));

  const colliders = new Colliders(data.buildings);
  const monuments = makeMonuments(data, colliders);
  const wAcc = makeAccumulator();
  const marble = rgb(0xf2ede0);
  monuments.forEach((m) => addRamp(wAcc, m.ramp, marble));
  group.add(wAcc.toMesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));

  return {
    group,
    colliders,
    monuments,
    ground: makeGround(monuments),
    counts: {
      buildings: data.buildings.length,
      roads: data.roads.length,
      plazas: data.plazas.length,
      monuments: monuments.length,
    },
  };
}
