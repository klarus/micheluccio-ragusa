// js/main.js — bootstrap del gioco: scena, fisica arcade, camera, HUD, minimappa, audio.
import * as THREE from '../vendor/three.module.js';
import { buildCity, nearestRoadPoint, makeGeoConverter, insidePoly } from './city.js';
import { buildBike } from './bike.js';

const SPAWN = { lat: 36.9268, lon: 14.7232 }; // Cattedrale di San Giovanni, Ragusa
const MAX_SPEED = 72; // m/s (~260 km/h): è pur sempre una Ducati

// ---------- renderer e scena
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e1) {
  try {
    renderer = new THREE.WebGL1Renderer({ antialias: true });
    console.warn('WebGL2 non disponibile: passo al fallback WebGL1.');
  } catch (e2) {
    const el = document.getElementById('overlay-msg');
    el.dataset.final = '1';
    el.textContent =
      'Il browser blocca la grafica WebGL. Controlla chrome://settings/content/webgl ' +
      '(consenti WebGL), chrome://settings/system (attiva accelerazione grafica) ' +
      'o disattiva estensioni anti-tracciamento. (' + e2.message + ')';
    throw e2;
  }
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c6e4);
scene.fog = new THREE.Fog(0xa9c6e4, 260, 1700);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 5000);
camera.position.set(0, 120, 220);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x8a7a5a, 0.85));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
sun.position.set(400, 600, 250);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- stato
const state = {
  ready: false, started: false, camMode: 0, muted: false,
  v: 0, heading: 0, steer: 0, vy: 0,
};
const bikePos = new THREE.Vector3();
const spawnPoint = { x: 0, z: 0, angle: 0 };
let colliders = null;
let monuments = [];
let ground = () => 0;
const conquered = new Set();

// ---------- moto + ombra finta
const bike = buildBike();
scene.add(bike.group);

function makeBlob() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 2.7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}
const blob = makeBlob();
bike.group.add(blob);

// ---------- HUD
const speedEl = document.querySelector('#speed .num');
const overlay = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');
const mapCanvas = document.getElementById('minimap');
const mapCtx = mapCanvas.getContext('2d');
const toastEl = document.getElementById('toast');
let toastTimer = 0;
let mapBase = null, mapTr = null;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.opacity = 0; }, 3200);
}

// marker dei monumenti: colonna di luce dorata + nome fluttuante
function addMonumentMarkers(list) {
  for (const m of list) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd60a, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.position.set(m.cx, m.h + 15, m.cz);
    scene.add(beam);

    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 96;
    const c = cv.getContext('2d');
    c.font = 'bold 42px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.strokeText(m.name, 256, 50);
    c.fillStyle = '#ffd60a';
    c.fillText(m.name, 256, 50);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
    );
    sp.scale.set(17, 3.2, 1);
    sp.position.set(m.cx, m.h + 5.5, m.cz);
    scene.add(sp);
  }
}

function buildMinimap(data) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#22262c';
  c.fillRect(0, 0, S, S);
  const conv = makeGeoConverter(data.center);
  const [minx, minz] = conv(data.bbox[0], data.bbox[1]);
  const [maxx, maxz] = conv(data.bbox[2], data.bbox[3]);
  const scale = S / Math.max(maxx - minx, maxz - minz);
  mapTr = { scale: scale * (mapCanvas.width / S), minx, minz };
  const px = (x, z) => [(x - minx) * scale, (z - minz) * scale];

  c.fillStyle = '#45403a';
  for (const b of data.buildings) {
    c.beginPath();
    for (let i = 1; i < b.length; i += 2) {
      const [X, Y] = px(b[i], b[i + 1]);
      if (i === 1) c.moveTo(X, Y); else c.lineTo(X, Y);
    }
    c.closePath();
    c.fill();
  }
  c.fillStyle = '#6b6353';
  for (const p of data.plazas) {
    c.beginPath();
    for (let i = 0; i < p.length; i += 2) {
      const [X, Y] = px(p[i], p[i + 1]);
      if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    }
    c.closePath();
    c.fill();
  }
  c.strokeStyle = '#9a9aa2';
  c.lineCap = 'round';
  for (const r of data.roads) {
    c.lineWidth = Math.max(1, r[0] * scale);
    c.beginPath();
    for (let i = 1; i < r.length; i += 2) {
      const [X, Y] = px(r[i], r[i + 1]);
      if (i === 1) c.moveTo(X, Y); else c.lineTo(X, Y);
    }
    c.stroke();
  }
  // monumenti: pallini dorati
  c.fillStyle = '#ffd60a';
  for (const m of data.monuments || []) {
    let mx = 0, mz = 0;
    const n = m.p.length / 2;
    for (let i = 0; i < n; i++) { mx += m.p[2 * i]; mz += m.p[2 * i + 1]; }
    const [X, Y] = px(mx / n, mz / n);
    c.beginPath();
    c.arc(X, Y, 3.5, 0, 7);
    c.fill();
  }
  mapBase = cv;
}

function drawMinimap() {
  if (!mapBase) return;
  mapCtx.drawImage(mapBase, 0, 0, mapCanvas.width, mapCanvas.height);
  const X = (bikePos.x - mapTr.minx) * mapTr.scale;
  const Y = (bikePos.z - mapTr.minz) * mapTr.scale;
  const a = Math.atan2(Math.sin(state.heading), -Math.cos(state.heading));
  mapCtx.save();
  mapCtx.translate(X, Y);
  mapCtx.rotate(a);
  mapCtx.fillStyle = '#ff3b30';
  mapCtx.beginPath();
  mapCtx.moveTo(0, -7);
  mapCtx.lineTo(4.5, 5);
  mapCtx.lineTo(-4.5, 5);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

// ---------- audio (motore sintetizzato)
let actx = null, osc = null, gain = null;
function initAudio() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  osc = actx.createOscillator();
  osc.type = 'sawtooth';
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 800;
  gain = actx.createGain();
  gain.gain.value = 0;
  osc.connect(lp);
  lp.connect(gain);
  gain.connect(actx.destination);
  osc.start();
}
function updateAudio(throttle) {
  if (!actx) return;
  const r = state.v / MAX_SPEED;
  osc.frequency.value = 55 + r * 165 + (throttle ? 22 : 0);
  gain.gain.value = state.muted ? 0 : 0.028 + r * 0.05 + (throttle ? 0.012 : 0);
}

// ---------- input
const keys = {};
function firstStart() {
  if (!state.ready || state.started) return;
  state.started = true;
  overlay.classList.add('hidden');
  initAudio();
}
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyC' && state.started) state.camMode = (state.camMode + 1) % 3;
  if (e.code === 'KeyM') state.muted = !state.muted;
  if (e.code === 'KeyR') respawn();
  firstStart();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
overlay.addEventListener('click', firstStart);

function respawn() {
  bikePos.set(spawnPoint.x, 0, spawnPoint.z);
  state.heading = spawnPoint.angle;
  state.v = 0;
  state.steer = 0;
  state.vy = 0;
}

// ---------- caricamento città
fetch('data/city.json')
  .then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(async (data) => {
    overlayMsg.textContent = 'dati scaricati, costruisco la città…';
    await new Promise((r) => setTimeout(r, 30)); // lascia comparire il messaggio
    const city = buildCity(data);
    scene.add(city.group);
    colliders = city.colliders;
    monuments = city.monuments;
    ground = city.ground;
    addMonumentMarkers(monuments);
    const conv = makeGeoConverter(data.center);
    const [sx, sz] = conv(SPAWN.lat, SPAWN.lon);
    const sp = nearestRoadPoint(data.roads, sx, sz);
    spawnPoint.x = sp.x; spawnPoint.z = sp.z; spawnPoint.angle = sp.angle;
    respawn();
    camera.position.set(sp.x - Math.sin(sp.angle) * 8, 3, sp.z - Math.cos(sp.angle) * 8);
    camera.lookAt(sp.x, 1.2, sp.z);
    buildMinimap(data);
    state.ready = true;
    overlayMsg.textContent =
      `${city.counts.buildings} edifici reali caricati — ` +
      `${city.counts.monuments} monumenti da scalare. Buon giro, Micheluccio!`;
  })
  .catch((err) => {
    overlayMsg.textContent =
      'Errore nel caricamento della città: ' + err.message +
      ' — avvia il gioco con un server locale (vedi README).';
  });

// ---------- fisica arcade
function update(dt) {
  const up = keys.ArrowUp || keys.KeyW;
  const down = keys.ArrowDown || keys.KeyS;
  const left = keys.ArrowLeft || keys.KeyA;
  const right = keys.ArrowRight || keys.KeyD;
  const hb = keys.Space;

  if (up) state.v += 24 * (1 - state.v / MAX_SPEED) * dt;
  if (down) state.v -= 26 * dt;
  if (hb) state.v -= 34 * dt;
  state.v -= (0.05 * state.v + 0.15) * dt; // attrito
  state.v = Math.max(0, Math.min(MAX_SPEED, state.v));

  const target = (left ? 1 : 0) - (right ? 1 : 0);
  state.steer += (target - state.steer) * Math.min(1, 8 * dt);
  const grip = Math.min(1, state.v / 6) * (1 - 0.45 * (state.v / MAX_SPEED));
  state.heading += state.steer * 2.3 * grip * (hb ? 1.45 : 1) * dt;

  const fx = Math.sin(state.heading), fz = Math.cos(state.heading);

  // a 200+ km/h un frame vale oltre un metro: sotto-passi per non trapassare i muri
  const steps = Math.max(1, Math.ceil((state.v * dt) / 0.8));
  for (let s = 0; s < steps; s++) {
    bikePos.x += (fx * state.v * dt) / steps;
    bikePos.z += (fz * state.v * dt) / steps;
    if (colliders) {
      const res = colliders.resolve(bikePos.x, bikePos.z, 1.05, bikePos.y);
      if (res.hit) {
        bikePos.x = res.x;
        bikePos.z = res.z;
        state.v *= 0.55;
      }
    }
  }

  // quota: rampe, tetti dei monumenti, cadute
  const g = ground(bikePos.x, bikePos.z, bikePos.y);
  if (bikePos.y > g + 0.02) {
    state.vy -= 22 * dt;
    bikePos.y += state.vy * dt;
    if (bikePos.y <= g) {
      bikePos.y = g;
      state.vy = 0;
    }
  } else {
    bikePos.y = g;
    state.vy = 0;
  }
  blob.position.y = g + 0.03 - bikePos.y;

  // conquista dei monumenti
  if (state.vy === 0 && bikePos.y > 0.5) {
    for (const m of monuments) {
      if (
        bikePos.y > m.h - 1.2 &&
        !conquered.has(m.name) &&
        insidePoly(m.p, bikePos.x, bikePos.z)
      ) {
        conquered.add(m.name);
        toast(`🏛 ${m.name} conquistato! (${conquered.size}/${monuments.length})`);
      }
    }
  }

  // ----- assetto visivo
  bike.group.position.copy(bikePos);
  bike.group.rotation.y = state.heading;
  const leanTarget = state.steer * Math.min(1, state.v / 14) * 0.5;
  bike.lean.rotation.z += (leanTarget - bike.lean.rotation.z) * Math.min(1, 7 * dt);
  const pitchTarget = down || hb ? 0.06 : up ? -0.05 : 0;
  bike.lean.rotation.x += (pitchTarget - bike.lean.rotation.x) * Math.min(1, 5 * dt);
  const spin = (state.v * dt) / 0.335;
  bike.wheels.front.rotation.x += spin;
  bike.wheels.rear.rotation.x += spin;
  bike.steer.rotation.y = state.steer * 0.28 * (1 - Math.min(1, state.v / 20) * 0.75);

  // ----- camera
  const k = 1 - Math.exp(-6 * dt);
  if (state.camMode === 2) {
    // onboard: dagli occhi di Micheluccio, con un filo di rollio in piega
    camera.position.set(bikePos.x - fx * 0.1, bikePos.y + 1.42, bikePos.z - fz * 0.1);
    camera.lookAt(bikePos.x + fx * 25, bikePos.y + 1.25, bikePos.z + fz * 25);
    camera.rotateZ(bike.lean.rotation.z * 0.45);
  } else {
    const [d, h, ahead] = state.camMode === 0 ? [6.5, 2.4, 5] : [11, 4.6, 7];
    const dx = bikePos.x - fx * d, dz = bikePos.z - fz * d;
    camera.position.x += (dx - camera.position.x) * k;
    camera.position.y += (bikePos.y + h - camera.position.y) * k;
    camera.position.z += (dz - camera.position.z) * k;
    camera.lookAt(bikePos.x + fx * ahead, bikePos.y + 1.2, bikePos.z + fz * ahead);
  }

  speedEl.textContent = Math.round(state.v * 3.6);
  drawMinimap();
  updateAudio(up);
}

// ---------- loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.started) update(dt);
  renderer.render(scene, camera);
}
animate();
