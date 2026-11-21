// OWNER: Susmit (city, roads, buildings, pandals).
// The 3D Kolkata city: roads with tram tracks, old North-Kolkata style buildings,
// yellow taxis, street lamps, trees, the Hooghly river, and every pandal.
//
// buildWorld(scene, data)
//   data = { pandals: [{id,name,type,x,z}], roads: [{x1,z1,x2,z2}], crowdZones: [...] }
//   (comes from the server: GET /api/sound-map; may be empty if the server is down)
// returns {
//   colliders: [{ minX, maxX, minZ, maxZ }],  // every building/wall the player can't walk through
//   setLight(light),                          // 1 = day, 0.15 = night (from timer:tick)
//   markDiscovered(pandalId),                 // turns that pandal's beacon green
//   pandals: Map(id -> { data, group }),      // the 3D object of each pandal
// }
//
// The city is built from a fixed random seed, so every player gets exactly the
// same buildings in the same places (important for multiplayer).
//
// Performance: repeated things (buildings, lamps, taxis, trees, road markings)
// use InstancedMesh, so each kind is a single draw call. This keeps phones fast.
import * as THREE from 'three';
import { WORLD_HALF_SIZE } from './config.js';

const ROAD_WIDTH = 10;
const CITY_SEED = 1757; // change to get a different (but still shared) city layout
const RIVER_EDGE = -WORLD_HALF_SIZE + 14; // the Hooghly runs along the west edge

// North-Kolkata wall colours: weathered orange, terracotta, ochre, lime-wash yellow,
// faded pink and green, old off-white (from the reference photos of Kolkata lanes)
const BUILDING_COLORS = [0xe8a25c, 0xd9894a, 0xe9c46a, 0xf0d58a, 0xc97b5a, 0xe5b3a3, 0xa9c2a0, 0xd8d0c0, 0xb5654a, 0xf2b880];
// Pandal colour themes: [main, trim]
const PANDAL_THEMES = [
  [0xc1121f, 0xffd166], [0x6a040f, 0xf4a261], [0x3a0ca3, 0xffd166],
  [0x9d0208, 0xffffff], [0x1d3557, 0xffb703], [0x7b2cbf, 0xf72585],
];

// Warm, hazy golden-hour palette
const DAY_SKY = new THREE.Color(0xa9c8e4);
const DUSK_SKY = new THREE.Color(0xe9a07a);
const NIGHT_SKY = new THREE.Color(0x101433);
const HAZE = new THREE.Color(0xe8cfa8);

// Small seeded random generator (same numbers on every device).
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pandal wall colliders in the pandal's local frame (+Z = open entrance), as [minX, maxX, minZ, maxZ].
const REGULAR_WALLS = [
  [-7.4, 7.4, -6.4, -5.6], // back wall
  [-7.4, -6.6, -6.4, 6], // left wall
  [6.6, 7.4, -6.4, 6], // right wall
  [-2.5, 2.5, -5.6, -2.75], // idol pedestal
];
const GHETTO_WALLS = [
  [-3, 3, -2.5, -1.7], // back cloth
  [-3, -2.4, -2.5, 1.2], // left side
  [2.4, 3, -2.5, 1.2], // right side
];

// Rotate a local box by the pandal's facing (snapped to 90°, roads are axis-aligned) into a world AABB.
function rotateBox([minX, maxX, minZ, maxZ], rotY, px, pz) {
  const a = Math.round(rotY / (Math.PI / 2)) * (Math.PI / 2);
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  const xs = [];
  const zs = [];
  for (const x of [minX, maxX]) {
    for (const z of [minZ, maxZ]) {
      xs.push(px + x * c + z * s);
      zs.push(pz - x * s + z * c);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function distToSegment(px, pz, r) {
  const vx = r.x2 - r.x1;
  const vz = r.z2 - r.z1;
  const len2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - r.x1) * vx + (pz - r.z1) * vz) / len2));
  return Math.hypot(px - (r.x1 + vx * t), pz - (r.z1 + vz * t));
}

function makeCanvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Wall texture with a grid of windows (tinted per building by instance colour),
// plus a matching "lit windows" texture that glows at night.
function buildingTextures(rand) {
  const cols = 4;
  const rows = 6;
  const wall = makeCanvasTexture(128, 192, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    // weathering: damp stains and peeling patches like old Kolkata walls
    for (let i = 0; i < 14; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 6 + rand() * 22;
      const grad = g.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, `rgba(60,45,30,${0.12 + rand() * 0.15})`);
      grad.addColorStop(1, 'rgba(60,45,30,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 6; i++) {
      // streaks running down from the top
      g.fillStyle = 'rgba(50,40,30,0.08)';
      g.fillRect(rand() * w, 0, 2 + rand() * 4, h * (0.3 + rand() * 0.6));
    }
    for (let r = 0; r < rows; r++) {
      g.fillStyle = 'rgba(0,0,0,0.08)'; // floor line
      g.fillRect(0, r * (h / rows), w, 3);
      for (let c = 0; c < cols; c++) {
        const x = c * (w / cols) + 8;
        const y = r * (h / rows) + 8;
        g.fillStyle = '#3d5a40'; // green wooden shutters, very Kolkata
        g.fillRect(x, y, w / cols - 16, h / rows - 14);
        g.fillStyle = '#2b2b2b';
        g.fillRect(x + 4, y + 4, w / cols - 24, h / rows - 22);
      }
    }
  });
  const lit = makeCanvasTexture(128, 192, (g, w, h) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rand() < 0.45) continue;
        g.fillStyle = rand() < 0.7 ? '#ffd28a' : '#fff1c1';
        g.fillRect(c * (w / cols) + 12, r * (h / rows) + 12, w / cols - 24, h / rows - 22);
      }
    }
  });
  return { wall, lit };
}

function nameBanner(name, theme) {
  return makeCanvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = `#${new THREE.Color(theme[0]).getHexString()}`;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = `#${new THREE.Color(theme[1]).getHexString()}`;
    g.lineWidth = 10;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#fff7e0';
    g.font = 'bold 46px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, w / 2, h / 2, w - 40);
  });
}

// ---------------------------------------------------------------------------

export function buildWorld(scene, data = {}) {
  const rand = seededRandom(CITY_SEED);
  const size = WORLD_HALF_SIZE * 2;
  const roads = data.roads || [];
  const pandalList = data.pandals || [];
  const crowdZones = data.crowdZones || [];
  const colliders = [];
  const glowMaterials = []; // materials that glow more at night: [material, dayIntensity, nightIntensity]

  // ---------- ground and river ----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x8a8173, roughness: 1 }) // dusty pavement
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const riverWidth = RIVER_EDGE + WORLD_HALF_SIZE;
  const riverMat = new THREE.MeshStandardMaterial({ color: 0x3f6e7a, roughness: 0.25, metalness: 0.2, emissive: 0x0a2030 });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(riverWidth, size), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(-WORLD_HALF_SIZE + riverWidth / 2, 0.03, 0);
  scene.add(river);
  colliders.push({ minX: -WORLD_HALF_SIZE - 10, maxX: RIVER_EDGE, minZ: -WORLD_HALF_SIZE - 10, maxZ: WORLD_HALF_SIZE + 10 });
  // riverbank ghat steps
  const ghat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, size), new THREE.MeshStandardMaterial({ color: 0xb8a98f }));
  ghat.position.set(RIVER_EDGE + 1, 0.3, 0);
  scene.add(ghat);

  // ---------- roads, lane markings, tram tracks ----------
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2f2f33, roughness: 0.95 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf1f1e6 });
  const dashes = [];
  for (const r of roads) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const angle = Math.atan2(r.x2 - r.x1, r.z2 - r.z1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, len), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -angle;
    road.position.set((r.x1 + r.x2) / 2, 0.02, (r.z1 + r.z2) / 2);
    scene.add(road);
    for (let d = 3; d < len; d += 8) {
      const t = d / len;
      dashes.push({ x: r.x1 + (r.x2 - r.x1) * t, z: r.z1 + (r.z2 - r.z1) * t, angle });
    }
    if (r.id === 'central-avenue') {
      // Kolkata tram tracks
      const railMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.8, roughness: 0.3 });
      for (const off of [-2.2, -0.9, 0.9, 2.2]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, len), railMat);
        rail.position.set(r.x1 + off, 0.06, (r.z1 + r.z2) / 2);
        scene.add(rail);
      }
    }
  }
  const dashMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 3), dashMat, Math.max(1, dashes.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  dashes.forEach((d, i) => {
    e.set(-Math.PI / 2, 0, -d.angle);
    q.setFromEuler(e);
    m.compose(v.set(d.x, 0.04, d.z), q, one);
    dashMesh.setMatrixAt(i, m);
  });
  dashMesh.count = dashes.length;
  scene.add(dashMesh);

  const nearRoad = (x, z, margin) => roads.some((r) => distToSegment(x, z, r) < ROAD_WIDTH / 2 + margin);
  const nearPandal = (x, z, regularGap, ghettoGap) =>
    pandalList.some((p) => Math.hypot(p.x - x, p.z - z) < (p.type === 'ghetto' ? ghettoGap : regularGap));

  // ---------- buildings ----------
  const { wall, lit } = buildingTextures(rand);
  const buildingMat = new THREE.MeshStandardMaterial({
    map: wall, emissiveMap: lit, emissive: 0xffd28a, emissiveIntensity: 0, roughness: 0.9,
  });
  glowMaterials.push([buildingMat, 0, 1.1]);
  const buildings = [];
  const CELL = 11; // denser blocks, narrower lanes
  for (let gx = -WORLD_HALF_SIZE + CELL / 2; gx < WORLD_HALF_SIZE; gx += CELL) {
    for (let gz = -WORLD_HALF_SIZE + CELL / 2; gz < WORLD_HALF_SIZE; gz += CELL) {
      const w = 7 + rand() * 4;
      const d = 7 + rand() * 4;
      const h = 7 + rand() * 13 + (rand() < 0.08 ? 12 : 0); // a few taller blocks
      const x = gx + (rand() - 0.5) * 2;
      const z = gz + (rand() - 0.5) * 2;
      const half = Math.max(w, d) / 2;
      if (x - half < RIVER_EDGE + 3) continue;
      if (Math.abs(x) + half > WORLD_HALF_SIZE - 1 || Math.abs(z) + half > WORLD_HALF_SIZE - 1) continue;
      if (nearRoad(x, z, half + 2)) continue; // leave a footpath
      if (nearPandal(x, z, 20 + half, 7 + half)) continue; // regular pandals get an open ground; ghetto ones hide in lanes
      if (crowdZones.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius * 0.5 + half)) continue;
      if (Math.hypot(x, z) < 14 + half) continue; // spawn square
      if (rand() < 0.05) continue; // the odd empty plot / gali
      buildings.push({ x, z, w, d, h, color: BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)] });
    }
  }
  const buildingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), buildingMat, Math.max(1, buildings.length));
  const roofMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x7a6e62, roughness: 1 }),
    Math.max(1, buildings.length)
  );
  const c = new THREE.Color();
  buildings.forEach((b, i) => {
    m.compose(v.set(b.x, b.h / 2, b.z), q.identity(), new THREE.Vector3(b.w, b.h, b.d));
    buildingMesh.setMatrixAt(i, m);
    buildingMesh.setColorAt(i, c.setHex(b.color));
    // rooftop parapet / water tank
    m.compose(v.set(b.x, b.h + 0.4, b.z), q.identity(), new THREE.Vector3(b.w * 0.5, 0.8, b.d * 0.5));
    roofMesh.setMatrixAt(i, m);
    colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
  });
  buildingMesh.count = buildings.length;
  roofMesh.count = buildings.length;
  scene.add(buildingMesh, roofMesh);

  // ---------- balconies with green railings, facing the street ----------
  const balconies = [];
  for (const b of buildings) {
    if (b.h < 9 || rand() < 0.3) continue;
    let best = null;
    for (const r of roads) {
      const d = distToSegment(b.x, b.z, r);
      if (!best || d < best.d) best = { d, r };
    }
    if (!best) continue;
    const vertical = Math.abs(best.r.x2 - best.r.x1) < Math.abs(best.r.z2 - best.r.z1);
    const sx = vertical ? Math.sign(best.r.x1 - b.x) || 1 : 0;
    const sz = vertical ? 0 : Math.sign(best.r.z1 - b.z) || 1;
    for (let floor = 1; floor * 4 + 1 < b.h - 1; floor++) {
      if (rand() < 0.35) continue;
      const y = floor * 4 + 0.6;
      const len = (vertical ? b.d : b.w) * (0.5 + rand() * 0.3);
      balconies.push({ x: b.x + sx * (b.w / 2 + 0.55), z: b.z + sz * (b.d / 2 + 0.55), y, len, vertical });
    }
  }
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x9c5b3a, roughness: 0.9 });
  const railMat2 = new THREE.MeshStandardMaterial({ color: 0x2f6b4f, roughness: 0.7 });
  const slabMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), slabMat, Math.max(1, balconies.length * 2));
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), railMat2, Math.max(1, balconies.length));
  const sc = new THREE.Vector3();
  balconies.forEach((bl, i) => {
    sc.set(bl.vertical ? 1.1 : bl.len, 0.2, bl.vertical ? bl.len : 1.1);
    m.compose(v.set(bl.x, bl.y, bl.z), q.identity(), sc);
    slabMesh.setMatrixAt(i * 2, m);
    // sunshade (chhajja) above the balcony
    m.compose(v.set(bl.x, bl.y + 3.0, bl.z), q.identity(), sc);
    slabMesh.setMatrixAt(i * 2 + 1, m);
    const ox = bl.vertical ? Math.sign(bl.x) * 0 : 0;
    sc.set(bl.vertical ? 0.08 : bl.len, 0.9, bl.vertical ? bl.len : 0.08);
    const px = bl.x + (bl.vertical ? (bl.x > 0 ? 0.5 : -0.5) : 0) * 0 + ox;
    m.compose(v.set(px, bl.y + 0.55, bl.z), q.identity(), sc);
    railMesh.setMatrixAt(i, m);
  });
  slabMesh.count = balconies.length * 2;
  railMesh.count = balconies.length;
  scene.add(slabMesh, railMesh);

  // ---------- overhead electric/cable wires sagging across the lanes ----------
  const wirePts = [];
  for (let i = 0; i < buildings.length && wirePts.length < 3000; i++) {
    const a = buildings[i];
    for (let j = i + 1; j < buildings.length; j++) {
      const b = buildings[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 9 || d > 20 || rand() > 0.18) continue;
      const ya = Math.min(a.h, 10) - 1;
      const yb = Math.min(b.h, 10) - 1;
      const sag = 0.8 + rand() * 1.2;
      let prev = null;
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const p = new THREE.Vector3(a.x + (b.x - a.x) * t, ya + (yb - ya) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t);
        if (prev) wirePts.push(prev, p);
        prev = p;
      }
    }
  }
  const wires = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(wirePts),
    new THREE.LineBasicMaterial({ color: 0x2a2420, transparent: true, opacity: 0.75 })
  );
  scene.add(wires);

  // ---------- street lamps ----------
  const lamps = [];
  for (const r of roads) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const nx = -(r.z2 - r.z1) / len; // normal to the road
    const nz = (r.x2 - r.x1) / len;
    for (let d = 10; d < len; d += 26) {
      const t = d / len;
      for (const side of [-1, 1]) {
        const x = r.x1 + (r.x2 - r.x1) * t + nx * side * (ROAD_WIDTH / 2 + 1);
        const z = r.z1 + (r.z2 - r.z1) * t + nz * side * (ROAD_WIDTH / 2 + 1);
        if (Math.abs(x) > WORLD_HALF_SIZE - 1 || Math.abs(z) > WORLD_HALF_SIZE - 1 || x < RIVER_EDGE + 2) continue;
        if (nearPandal(x, z, 9, 4)) continue;
        lamps.push({ x, z });
      }
    }
  }
  const poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.15, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x2e4d3a }),
    Math.max(1, lamps.length)
  );
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffc46b, emissiveIntensity: 0.1 });
  glowMaterials.push([lampHeadMat, 0.1, 2.5]);
  const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 8, 6), lampHeadMat, Math.max(1, lamps.length));
  lamps.forEach((l, i) => {
    m.compose(v.set(l.x, 3, l.z), q.identity(), one);
    poleMesh.setMatrixAt(i, m);
    m.compose(v.set(l.x, 6.2, l.z), q.identity(), one);
    headMesh.setMatrixAt(i, m);
  });
  poleMesh.count = headMesh.count = lamps.length;
  scene.add(poleMesh, headMesh);

  // ---------- yellow Ambassador taxis parked along the roads ----------
  const taxis = [];
  for (let tries = 0; tries < 400 && taxis.length < 36; tries++) {
    const r = roads[Math.floor(rand() * roads.length)];
    if (!r) break;
    const t = 0.05 + rand() * 0.9;
    const vertical = Math.abs(r.x2 - r.x1) < Math.abs(r.z2 - r.z1);
    const side = rand() < 0.5 ? -1 : 1;
    const x = r.x1 + (r.x2 - r.x1) * t + (vertical ? side * (ROAD_WIDTH / 2 - 1.3) : 0);
    const z = r.z1 + (r.z2 - r.z1) * t + (vertical ? 0 : side * (ROAD_WIDTH / 2 - 1.3));
    if (x < RIVER_EDGE + 3 || Math.hypot(x, z) < 16 || nearPandal(x, z, 14, 6)) continue;
    // not in the middle of a crossing
    if (roads.some((o) => o !== r && distToSegment(x, z, o) < ROAD_WIDTH)) continue;
    taxis.push({ x, z, vertical });
  }
  const taxiBody = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.9, 1.1, 4.2),
    new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }),
    Math.max(1, taxis.length)
  );
  const taxiTop = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.7, 0.8, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }),
    Math.max(1, taxis.length)
  );
  const taxiWheels = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.0, 0.6, 3.0),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
    Math.max(1, taxis.length)
  );
  taxis.forEach((t, i) => {
    q.setFromEuler(e.set(0, t.vertical ? 0 : Math.PI / 2, 0));
    m.compose(v.set(t.x, 0.95, t.z), q, one);
    taxiBody.setMatrixAt(i, m);
    m.compose(v.set(t.x, 1.9, t.z), q, one);
    taxiTop.setMatrixAt(i, m);
    m.compose(v.set(t.x, 0.3, t.z), q, one);
    taxiWheels.setMatrixAt(i, m);
    const hx = t.vertical ? 1 : 2.1;
    const hz = t.vertical ? 2.1 : 1;
    colliders.push({ minX: t.x - hx, maxX: t.x + hx, minZ: t.z - hz, maxZ: t.z + hz });
  });
  taxiBody.count = taxiTop.count = taxiWheels.count = taxis.length;
  scene.add(taxiBody, taxiTop, taxiWheels);

  // ---------- motorbikes parked on the footpaths ----------
  const bikes = [];
  for (let tries = 0; tries < 500 && bikes.length < 40; tries++) {
    const r = roads[Math.floor(rand() * roads.length)];
    if (!r) break;
    const t = 0.03 + rand() * 0.94;
    const vertical = Math.abs(r.x2 - r.x1) < Math.abs(r.z2 - r.z1);
    const side = rand() < 0.5 ? -1 : 1;
    const off = ROAD_WIDTH / 2 + 1.0;
    const x = r.x1 + (r.x2 - r.x1) * t + (vertical ? side * off : 0);
    const z = r.z1 + (r.z2 - r.z1) * t + (vertical ? 0 : side * off);
    if (x < RIVER_EDGE + 3 || Math.hypot(x, z) < 14 || nearPandal(x, z, 12, 5)) continue;
    if (colliders.some((c) => x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1)) continue;
    bikes.push({ x, z, vertical: !vertical, color: [0x111111, 0x7a0d0d, 0x1d3557, 0x333333][Math.floor(rand() * 4)] });
  }
  const bikeBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.55, 1.7), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.5 }), Math.max(1, bikes.length));
  const bikeWheels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.6, 1.9), new THREE.MeshStandardMaterial({ color: 0x111111 }), Math.max(1, bikes.length));
  bikes.forEach((bk, i) => {
    q.setFromEuler(e.set(0, bk.vertical ? 0 : Math.PI / 2, 0.08));
    m.compose(v.set(bk.x, 0.75, bk.z), q, one);
    bikeBody.setMatrixAt(i, m);
    bikeBody.setColorAt(i, c.setHex(bk.color));
    m.compose(v.set(bk.x, 0.3, bk.z), q, one);
    bikeWheels.setMatrixAt(i, m);
    const hx = bk.vertical ? 0.4 : 1;
    const hz = bk.vertical ? 1 : 0.4;
    colliders.push({ minX: bk.x - hx, maxX: bk.x + hx, minZ: bk.z - hz, maxZ: bk.z + hz });
  });
  bikeBody.count = bikeWheels.count = bikes.length;
  scene.add(bikeBody, bikeWheels);

  // ---------- coconut palms (along the ghat and in open grounds) ----------
  const palms = [];
  for (let z = -WORLD_HALF_SIZE + 12; z < WORLD_HALF_SIZE - 6; z += 16 + rand() * 10) {
    palms.push({ x: RIVER_EDGE + 4 + rand() * 2, z, h: 8 + rand() * 4, lean: (rand() - 0.5) * 0.3 });
  }
  for (let tries = 0; tries < 300 && palms.length < 45; tries++) {
    const x = (rand() * 2 - 1) * (WORLD_HALF_SIZE - 6);
    const z = (rand() * 2 - 1) * (WORLD_HALF_SIZE - 6);
    if (x < RIVER_EDGE + 6 || nearRoad(x, z, 3) || nearPandal(x, z, 12, 5) || Math.hypot(x, z) < 8) continue;
    if (colliders.some((b) => x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2)) continue;
    palms.push({ x, z, h: 8 + rand() * 5, lean: (rand() - 0.5) * 0.3 });
  }
  const palmTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 1, 7), new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 1 }), Math.max(1, palms.length));
  const frondGeo = new THREE.ConeGeometry(0.5, 4.2, 4);
  frondGeo.translate(0, 2.1, 0); // pivot at the base of the frond
  const palmLeaves = new THREE.InstancedMesh(frondGeo, new THREE.MeshStandardMaterial({ color: 0x3f7a35, flatShading: true }), Math.max(1, palms.length * 7));
  palms.forEach((p, i) => {
    q.setFromEuler(e.set(p.lean, 0, p.lean * 0.5));
    m.compose(v.set(p.x, p.h / 2, p.z), q, new THREE.Vector3(1, p.h, 1));
    palmTrunk.setMatrixAt(i, m);
    const topX = p.x + Math.sin(p.lean * 0.5) * -p.h * 0.5;
    const topZ = p.z + Math.sin(p.lean) * p.h * 0.5;
    for (let k = 0; k < 7; k++) {
      q.setFromEuler(e.set(1.9, (k / 7) * Math.PI * 2, 0, 'YXZ'));
      m.compose(v.set(topX, p.h, topZ), q, one);
      palmLeaves.setMatrixAt(i * 7 + k, m);
    }
    colliders.push({ minX: p.x - 0.35, maxX: p.x + 0.35, minZ: p.z - 0.35, maxZ: p.z + 0.35 });
  });
  palmTrunk.count = palms.length;
  palmLeaves.count = palms.length * 7;
  scene.add(palmTrunk, palmLeaves);

  // ---------- trees (in open spaces around pandals and the spawn square) ----------
  const trees = [];
  for (let tries = 0; tries < 600 && trees.length < 70; tries++) {
    const x = (rand() * 2 - 1) * (WORLD_HALF_SIZE - 4);
    const z = (rand() * 2 - 1) * (WORLD_HALF_SIZE - 4);
    if (x < RIVER_EDGE + 4 || nearRoad(x, z, 2) || nearPandal(x, z, 11, 5) || Math.hypot(x, z) < 8) continue;
    if (colliders.some((b) => x > b.minX - 1.5 && x < b.maxX + 1.5 && z > b.minZ - 1.5 && z < b.maxZ + 1.5)) continue;
    trees.push({ x, z, s: 0.8 + rand() * 0.7 });
  }
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.25, 0.35, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3e2b }),
    Math.max(1, trees.length)
  );
  const leafMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(2.2, 0),
    new THREE.MeshStandardMaterial({ color: 0x3f7d3a, flatShading: true }),
    Math.max(1, trees.length)
  );
  trees.forEach((t, i) => {
    m.compose(v.set(t.x, 1.5 * t.s, t.z), q.identity(), v.clone().set(t.s, t.s, t.s));
    m.setPosition(t.x, 1.5 * t.s, t.z);
    trunkMesh.setMatrixAt(i, m);
    m.compose(v.set(t.x, 3.8 * t.s, t.z), q.identity(), new THREE.Vector3(t.s, t.s, t.s));
    leafMesh.setMatrixAt(i, m);
    colliders.push({ minX: t.x - 0.4, maxX: t.x + 0.4, minZ: t.z - 0.4, maxZ: t.z + 0.4 });
  });
  trunkMesh.count = leafMesh.count = trees.length;
  scene.add(trunkMesh, leafMesh);

  // ---------- pandals ----------
  const pandals = new Map();
  for (const p of pandalList) {
    const theme = PANDAL_THEMES[Math.floor(rand() * PANDAL_THEMES.length)];
    const group = p.type === 'ghetto' ? buildGhettoPandal(p, theme, glowMaterials) : buildRegularPandal(p, theme, glowMaterials);
    // Face the entrance toward the nearest road.
    let best = null;
    for (const r of roads) {
      const vx = r.x2 - r.x1;
      const vz = r.z2 - r.z1;
      const len2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - r.x1) * vx + (p.z - r.z1) * vz) / len2));
      const px = r.x1 + vx * t;
      const pz = r.z1 + vz * t;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (!best || d < best.d) best = { d, px, pz };
    }
    // Snap to 90° so the model lines up with its wall colliders and the grid of roads.
    if (best && best.d > 0.5) group.rotation.y = Math.round(Math.atan2(best.px - p.x, best.pz - p.z) / (Math.PI / 2)) * (Math.PI / 2);
    group.position.set(p.x, 0, p.z);
    scene.add(group);
    pandals.set(p.id, { data: p, group, beacon: group.userData.beacon });
    // Solid back and side walls so players can only walk in through the entrance (+Z).
    for (const box of p.type === 'ghetto' ? GHETTO_WALLS : REGULAR_WALLS) {
      colliders.push(rotateBox(box, group.rotation.y, p.x, p.z));
    }
  }

  // ---------- day / night ----------
  let sunLight = null;
  let hemiLight = null;
  scene.traverse((o) => {
    if (o.isDirectionalLight && !sunLight) sunLight = o;
    if (o.isHemisphereLight && !hemiLight) hemiLight = o;
  });
  const sunDay = sunLight ? sunLight.intensity : 1.5;
  const hemiDay = hemiLight ? hemiLight.intensity : 1.2;
  const sky = new THREE.Color();

  function setLight(light) {
    const l = THREE.MathUtils.clamp(light, 0, 1);
    if (l > 0.6) sky.copy(DUSK_SKY).lerp(DAY_SKY, (l - 0.6) / 0.4);
    else sky.copy(NIGHT_SKY).lerp(DUSK_SKY, Math.max(0, (l - 0.15) / 0.45));
    if (scene.background && scene.background.isColor) scene.background.copy(sky);
    else scene.background = sky.clone();
    // warm golden haze near the horizon by day, blending into the sky
    if (scene.fog) scene.fog.color.copy(sky).lerp(HAZE, 0.5 * l);
    if (sunLight) {
      sunLight.intensity = sunDay * Math.max(0.08, l);
      sunLight.color.setHex(l < 0.5 ? 0x8fa6ff : 0xffd9a0); // warm sun by day, moonlight at night
    }
    if (hemiLight) hemiLight.intensity = hemiDay * (0.3 + 0.7 * l);
    const night = 1 - (l - 0.15) / 0.85;
    for (const [mat, day, nightVal] of glowMaterials) {
      mat.emissiveIntensity = day + (nightVal - day) * THREE.MathUtils.clamp(night, 0, 1);
    }
  }
  setLight(1);

  function markDiscovered(id) {
    const entry = pandals.get(id);
    if (!entry || !entry.beacon) return;
    entry.beacon.material.color.setHex(0x52d273);
    entry.beacon.userData.found = true;
  }

  return { colliders, setLight, markDiscovered, pandals };
}

// ---------------------------------------------------------------------------
// Pandal models. The local +Z axis is the entrance (it faces the nearest road).
// ---------------------------------------------------------------------------

function fairyLights(points, colors) {
  const geo = new THREE.BufferGeometry();
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  points.forEach((p, i) => {
    pos.push(p.x, p.y, p.z);
    c.setHex(colors[i % colors.length]);
    col.push(c.r, c.g, c.b);
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  // twinkle
  pts.onBeforeRender = () => {
    mat.opacity = 0.75 + 0.25 * Math.sin(performance.now() / 180);
  };
  return pts;
}

function idol(scale, glowMaterials) {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc94d, emissive: 0xff9f1c, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.35 });
  glowMaterials.push([gold, 0.4, 1.2]);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.2, 10), gold);
  body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), gold);
  head.position.y = 2.6;
  const haloMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffd166, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  glowMaterials.push([haloMat, 0.8, 2.2]);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 28), haloMat);
  halo.position.set(0, 2.6, -0.3);
  // ten arms of Durga, as a fan of thin golden rods
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 9) * Math.PI;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), gold);
    arm.position.set(Math.cos(a) * 0.7, 1.9 + Math.sin(a) * 0.3, -0.1);
    arm.rotation.z = a - Math.PI / 2;
    g.add(arm);
  }
  g.add(body, head, halo);
  g.scale.setScalar(scale);
  return g;
}

function buildRegularPandal(p, theme, glowMaterials) {
  const g = new THREE.Group();
  const main = new THREE.MeshStandardMaterial({ color: theme[0], roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: theme[1], emissive: theme[1], emissiveIntensity: 0.15, roughness: 0.5 });
  glowMaterials.push([trim, 0.15, 0.9]);

  // platform
  const base = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 14), new THREE.MeshStandardMaterial({ color: 0x8b5e3c }));
  base.position.y = 0.3;
  g.add(base);

  // three walls, open at the front
  const back = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 0.8), main);
  back.position.set(0, 5.1, -6);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 12), main);
  left.position.set(-7, 5.1, 0);
  const right = left.clone();
  right.position.x = 7;
  g.add(back, left, right);

  // tiered temple-style roof (shikhara)
  for (let i = 0; i < 3; i++) {
    const tier = new THREE.Mesh(new THREE.ConeGeometry(10 - i * 2.8, 3.2, 4), i % 2 ? main : trim);
    tier.rotation.y = Math.PI / 4;
    tier.position.y = 11.2 + i * 2.4;
    g.add(tier);
  }
  const kalash = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), trim);
  kalash.position.y = 18.4;
  g.add(kalash);

  // idol inside, at the back
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 2.5), trim);
  pedestal.position.set(0, 1.2, -4);
  const durga = idol(1.6, glowMaterials);
  durga.position.set(0, 1.8, -4);
  g.add(pedestal, durga);

  // entrance gate (torana) with a name banner
  const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, 10, 10);
  for (const x of [-5, 5]) {
    const pillar = new THREE.Mesh(pillarGeo, trim);
    pillar.position.set(x, 5, 11);
    g.add(pillar);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 8, 24, Math.PI), trim);
  arch.position.set(0, 10, 11);
  g.add(arch);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.25),
    new THREE.MeshBasicMaterial({ map: nameBanner(p.name, theme), side: THREE.DoubleSide })
  );
  banner.position.set(0, 12.2, 11.1);
  g.add(banner);

  // fairy lights along the gate and the roof edge
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * 5.6, 10 + Math.sin(a) * 5.6, 11.3));
  }
  for (let y = 0.5; y < 10; y += 0.8) {
    pts.push(new THREE.Vector3(-5.7, y, 11.3), new THREE.Vector3(5.7, y, 11.3));
  }
  for (let x = -7; x <= 7; x += 0.9) pts.push(new THREE.Vector3(x, 9.8, 6.4));
  g.add(fairyLights(pts, [0xff5d8f, 0xffd166, 0x7bdff2, 0xb8f2a6, 0xffffff]));

  // a tall light beacon so players can spot pandals across the city
  const beaconMat = new THREE.MeshBasicMaterial({ color: theme[1], transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 80, 12, 1, true), beaconMat);
  beacon.position.y = 40;
  beacon.onBeforeRender = () => {
    const t = performance.now() / 1000;
    beaconMat.opacity = (beacon.userData.found ? 0.1 : 0.16) + 0.06 * Math.sin(t * 2 + p.x);
  };
  g.add(beacon);
  g.userData.beacon = beacon;
  return g;
}

function buildGhettoPandal(p, theme, glowMaterials) {
  // A small para pandal tucked into a lane: cloth tent, small idol, one string of lights.
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 5), new THREE.MeshStandardMaterial({ color: 0x6d4c33 }));
  base.position.y = 0.2;
  g.add(base);

  const clothA = new THREE.MeshStandardMaterial({ color: theme[0], side: THREE.DoubleSide });
  const clothB = new THREE.MeshStandardMaterial({ color: 0xf8f1e5, side: THREE.DoubleSide });
  // striped tent made of alternating cone slices
  for (let i = 0; i < 8; i++) {
    const slice = new THREE.Mesh(new THREE.ConeGeometry(3.6, 3.2, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), i % 2 ? clothA : clothB);
    slice.position.y = 5;
    g.add(slice);
  }
  for (const [x, z] of [[-2.6, -2], [2.6, -2], [-2.6, 2], [2.6, 2]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x5a3e2b }));
    pole.position.set(x, 1.9, z);
    g.add(pole);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.2), clothA);
  back.position.set(0, 2, -2);
  g.add(back);

  const durga = idol(0.75, glowMaterials);
  durga.position.set(0, 0.4, -1.2);
  g.add(durga);

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.1),
    new THREE.MeshBasicMaterial({ map: nameBanner(p.name, theme), side: THREE.DoubleSide })
  );
  banner.position.set(0, 3.9, 2.1);
  g.add(banner);

  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const x = -2.6 + (i / 16) * 5.2;
    pts.push(new THREE.Vector3(x, 3.4 - Math.sin((i / 16) * Math.PI) * 0.5, 2.1));
  }
  g.add(fairyLights(pts, [0xffd166, 0xff5d8f, 0xffffff]));
  return g;
}
