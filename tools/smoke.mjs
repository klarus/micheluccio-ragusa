// tools/smoke.mjs — test senza browser: costruisce città e moto con i dati reali.
// Esegui con: node tools/smoke.mjs
import { readFileSync } from 'node:fs';
import { buildCity, nearestRoadPoint, makeGeoConverter } from '../js/city.js';
import { buildBike } from '../js/bike.js';

const data = JSON.parse(readFileSync(new URL('../data/city.json', import.meta.url), 'utf8'));
console.log(`dati: ${data.buildings.length} edifici, ${data.roads.length} strade, ${data.plazas.length} piazze`);

// --- città
const { group, colliders } = buildCity(data);
if (group.children.length < 4) throw new Error('gruppo città incompleto');
let verts = 0;
group.traverse((o) => {
  if (o.geometry?.attributes?.position) verts += o.geometry.attributes.position.count;
});
console.log(`mesh città: ${group.children.length} oggetti, ${verts} vertici`);
if (verts < 100000) throw new Error('troppi pochi vertici: città probabilmente vuota');

// --- spawn vicino alla Cattedrale di San Giovanni
const conv = makeGeoConverter(data.center);
const [sx, sz] = conv(36.9268, 14.7232);
const sp = nearestRoadPoint(data.roads, sx, sz);
console.log(
  `spawn: (${sp.x.toFixed(0)}, ${sp.z.toFixed(0)}) dist ${sp.dist.toFixed(1)}m ` +
  `angolo ${((sp.angle * 180) / Math.PI).toFixed(0)}°`
);
if (sp.dist > 120) throw new Error('nessuna strada vicina al punto di spawn');

// --- collisioni: il baricentro di almeno un edificio deve collidere
let hitFound = false;
for (let bi = 0; bi < 200 && !hitFound; bi++) {
  const b = data.buildings[bi];
  let cx = 0, cz = 0;
  const n = (b.length - 1) / 2;
  for (let i = 1; i < b.length; i += 2) { cx += b[i]; cz += b[i + 1]; }
  cx /= n; cz /= n;
  const res = colliders.resolve(cx, cz, 1.0);
  if (res.hit) {
    hitFound = true;
    console.log(`collisione ok (edificio #${bi}): spinto fuori di ${Math.hypot(res.x - cx, res.z - cz).toFixed(2)}m`);
  }
}
if (!hitFound) throw new Error('nessuna collisione rilevata: collider rotto');

// punto lontano dalla città: nessuna collisione
const free = colliders.resolve(5000, 5000, 1.0);
if (free.hit) throw new Error('falso positivo in zona vuota');
console.log('zona vuota ok');

// --- moto + Micheluccio (in node le scritte canvas sono saltate)
const bike = buildBike();
let parts = 0;
bike.group.traverse(() => parts++);
console.log(`moto + Micheluccio: ${parts} parti`);
if (parts < 25) throw new Error('modello moto incompleto');
if (!bike.wheels.front || !bike.wheels.rear || !bike.lean || !bike.steer) {
  throw new Error('riferimenti moto mancanti');
}

console.log('SMOKE TEST OK');
