// js/bike.js — Micheluccio ("l'ultimo centauro di Ragusa"): calvo, occhiali neri,
// pizzetto grigio, blazer blu navy e camicia bianca, sulla Ducati gialla stile 916.
// Modello low-poly costruito da primitive three.js. Avanti = +z, su = +y.
import * as THREE from '../vendor/three.module.js';

const DUCATI_YELLOW = 0xf7c500;
const NAVY = 0x1f2a44;

function mats() {
  const std = (color, roughness, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    yellow: std(DUCATI_YELLOW, 0.28, 0.25),
    navy: std(NAVY, 0.75),           // blazer
    cream: std(0xd8d2c4, 0.85),      // pantaloni chiari
    brown: std(0x6b4a2f, 0.7),       // scarpe
    gray: std(0xc8c8c4, 0.7),        // pizzetto
    red: std(0xc01018, 0.5),
    black: std(0x161616, 0.85),
    tire: std(0x101010, 0.95),
    metal: std(0x9a9a9a, 0.35, 0.8),
    darkMetal: std(0x3c3c3c, 0.5, 0.6),
    skin: std(0xe2b18c, 0.5),        // testa calva, leggermente lucida
    white: std(0xf2f2f2, 0.6),
  };
}

// cilindro tra due punti (arti, forcelle, scarichi…)
function limb(ax, ay, az, bx, by, bz, r, mat) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
  const d = b.clone().sub(a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function box(w, h, d, mat, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  return m;
}

// scritta su piano con texture canvas (null se non c'è DOM, es. test in node)
function textPlane(text, w, h, fg, { bg = null, px = 88 } = {}) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128); }
  ctx.fillStyle = fg;
  ctx.font = `bold italic ${px}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
}

export function buildBike() {
  const M = mats();
  const group = new THREE.Group(); // posizione + heading (rotation.y)
  const lean = new THREE.Group();  // piega in curva + beccheggio
  group.add(lean);

  // ---- ruote (gruppo che gira su x: pneumatico + mozzo)
  function wheel() {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.095, 10, 20), M.tire);
    tire.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 14), M.metal);
    hub.rotation.z = Math.PI / 2;
    g.add(tire, hub);
    return g;
  }
  const rearWheel = wheel();
  rearWheel.position.set(0, 0.33, -0.62);
  lean.add(rearWheel);

  // ---- avantreno sterzante (ruota, forcella, manubrio, cupolino)
  const steer = new THREE.Group();
  steer.position.set(0, 0.55, 0.62);
  lean.add(steer);

  const frontWheel = wheel();
  frontWheel.position.set(0, -0.22, 0.16);
  steer.add(frontWheel);
  steer.add(limb(0.055, -0.22, 0.16, 0.055, 0.3, -0.03, 0.022, M.metal));
  steer.add(limb(-0.055, -0.22, 0.16, -0.055, 0.3, -0.03, 0.022, M.metal));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.46, 8), M.darkMetal);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.32, -0.03);
  steer.add(bar);
  steer.add(box(0.09, 0.04, 0.04, M.black, 0.23, 0.32, -0.03));
  steer.add(box(0.09, 0.04, 0.04, M.black, -0.23, 0.32, -0.03));
  // specchietti
  steer.add(limb(0.2, 0.32, -0.03, 0.26, 0.44, -0.06, 0.008, M.black));
  steer.add(limb(-0.2, 0.32, -0.03, -0.26, 0.44, -0.06, 0.008, M.black));
  steer.add(box(0.07, 0.04, 0.02, M.black, 0.27, 0.45, -0.06));
  steer.add(box(0.07, 0.04, 0.02, M.black, -0.27, 0.45, -0.06));
  // cupolino giallo + doppio faro (stile 916) + plexiglas fumé
  steer.add(box(0.28, 0.26, 0.42, M.yellow, 0, 0.14, 0.08, -0.22));
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0x777055, roughness: 0.2 });
  for (const s of [1, -1]) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), headMat);
    head.position.set(0.065 * s, 0.09, 0.29);
    steer.add(head);
  }
  const screen = box(0.22, 0.12, 0.015, M.black, 0, 0.27, 0.13, -0.55);
  screen.material = new THREE.MeshStandardMaterial({
    color: 0x1a2028, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85,
  });
  steer.add(screen);
  steer.add(box(0.14, 0.03, 0.34, M.yellow, 0, 0.14, 0.16, 0.12)); // parafango
  // tabella gara "FM" sul muso
  const plateFM = textPlane('FM', 0.14, 0.09, '#1a2a6b', { bg: '#f5f5f5', px: 76 });
  if (plateFM) {
    plateFM.position.set(0, 0.19, 0.295);
    plateFM.rotation.x = -0.22;
    steer.add(plateFM);
  }
  // scritta DUCATI sulle fiancate del cupolino
  const sideR = textPlane('DUCATI', 0.3, 0.08, '#1a1a1a');
  if (sideR) { sideR.position.set(0.145, 0.16, 0.08); sideR.rotation.y = Math.PI / 2; steer.add(sideR); }
  const sideL = textPlane('DUCATI', 0.3, 0.08, '#1a1a1a');
  if (sideL) { sideL.position.set(-0.145, 0.16, 0.08); sideL.rotation.y = -Math.PI / 2; steer.add(sideL); }

  // ---- corpo centrale
  lean.add(box(0.14, 0.2, 0.9, M.darkMetal, 0, 0.55, 0.05));          // telaio
  lean.add(box(0.32, 0.28, 0.42, M.darkMetal, 0, 0.38, 0.02));        // motore
  const tank = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.yellow);
  tank.scale.set(0.21, 0.17, 0.34);
  tank.position.set(0, 0.74, 0.12);
  lean.add(tank);
  lean.add(box(0.2, 0.05, 0.45, M.black, 0, 0.7, -0.33));             // sella
  lean.add(box(0.17, 0.09, 0.3, M.yellow, 0, 0.73, -0.58, 0.14));     // codino
  const tail = box(0.1, 0.04, 0.02, M.red, 0, 0.72, -0.74);
  tail.material = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0x550000 });
  lean.add(tail);
  // forcellone + scarico
  lean.add(box(0.05, 0.06, 0.5, M.darkMetal, 0.08, 0.35, -0.42));
  lean.add(box(0.05, 0.06, 0.5, M.darkMetal, -0.08, 0.35, -0.42));
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.65, 10), M.metal);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.15, 0.27, -0.25);
  lean.add(exhaust);
  // targa
  const plate = textPlane('RAGUSA', 0.15, 0.09, '#111111', { bg: '#f5f5f5', px: 72 });
  if (plate) {
    plate.position.set(0, 0.66, -0.75);
    plate.rotation.y = Math.PI;
    lean.add(plate);
  }

  // ---- MICHELUCCIO: calvo, occhiali neri, pizzetto grigio, blazer navy
  const rider = new THREE.Group();
  lean.add(rider);
  rider.add(box(0.3, 0.18, 0.22, M.cream, 0, 0.82, -0.28));           // bacino
  rider.add(box(0.36, 0.48, 0.24, M.navy, 0, 1.12, -0.16, 0.25));     // busto (blazer)
  rider.add(box(0.15, 0.22, 0.03, M.white, 0, 1.2, -0.045, 0.25));    // camicia
  // braccia: spalla -> gomito -> manopola (blazer, guanti neri)
  for (const s of [1, -1]) {
    rider.add(limb(0.21 * s, 1.28, -0.12, 0.24 * s, 1.05, 0.12, 0.055, M.navy));
    rider.add(limb(0.24 * s, 1.05, 0.12, 0.19 * s, 0.9, 0.55, 0.048, M.navy));
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.black);
    glove.position.set(0.19 * s, 0.9, 0.55);
    rider.add(glove);
    // gambe: anca -> ginocchio -> scarpa (pantaloni chiari, scarpe marroni)
    rider.add(limb(0.13 * s, 0.8, -0.26, 0.22 * s, 0.55, 0.05, 0.075, M.cream));
    rider.add(limb(0.22 * s, 0.55, 0.05, 0.16 * s, 0.34, -0.02, 0.06, M.cream));
    rider.add(box(0.09, 0.08, 0.22, M.brown, 0.16 * s, 0.3, 0.0));
  }
  // collo + testa calva + pizzetto + occhiali
  rider.add(limb(0, 1.34, -0.1, 0, 1.42, -0.08, 0.05, M.skin));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), M.skin);
  head.position.set(0, 1.49, -0.06);
  rider.add(head);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), M.gray);
  beard.scale.set(0.095, 0.07, 0.095);
  beard.position.set(0, 1.435, -0.005);                               // mascella/mento
  rider.add(beard);
  rider.add(box(0.07, 0.02, 0.025, M.gray, 0, 1.478, 0.048));          // baffi
  rider.add(box(0.17, 0.04, 0.02, M.black, 0, 1.508, 0.048));          // occhiali (montatura fina)
  // scritta DUCATI sulla schiena (bianca sul blazer navy)
  const back = textPlane('DUCATI', 0.32, 0.09, '#f2f2f2');
  if (back) {
    back.position.set(0, 1.15, -0.295);
    back.rotation.y = Math.PI;
    back.rotation.x = -0.25;
    rider.add(back);
  }

  return { group, lean, steer, wheels: { front: frontWheel, rear: rearWheel } };
}
