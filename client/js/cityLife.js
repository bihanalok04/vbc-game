// City life: Kolkata street-food stalls (eat for a stamina surge) and 8 Bengali
// characters who wander the Puja streets.
//
// buildCityLife(scene, world)
// returns {
//   stalls: [{ id, food, x, z }],
//   nearestStall(x, z, radius) -> stall or null,
//   update(dt),            // animates the characters
// }
//
// Everything is placed from fixed data, so every player sees the same stalls
// and characters (important for multiplayer).
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Character names: fill these in (in the same order as CHARACTERS below).
// A name tag only appears above a character once their name is set.
// ---------------------------------------------------------------------------
export const CHARACTER_NAMES = ['', '', '', '', '', '', '', ''];

// Food stalls along the footpaths. [food, x, z]
const STALLS = [
  ['Phuchka', 6.4, -50], ['Kathi Roll', -6.4, 45], ['Jhalmuri', 6.4, 112],
  ['Kathi Roll', -60, 6.4], ['Phuchka', 40, -6.4], ['Bhaar Chai', 128, 6.4],
  ['Jhalmuri', -70, -86.4], ['Kathi Roll', 52, -73.6],
  ['Phuchka', -60, 86.4], ['Rosogolla', 15, 73.6], ['Bhaar Chai', 122, 86.4],
  ['Ghugni', -103.6, -122], ['Kathi Roll', -116.4, 50],
  ['Phuchka', 96.4, -58], ['Jhalmuri', 83.6, 122], ['Mishti Doi', -103.6, 128],
];
const FOOD_COLORS = {
  'Phuchka': 0xe76f51, 'Kathi Roll': 0x2a9d8f, 'Jhalmuri': 0xe9c46a,
  'Bhaar Chai': 0x8d5524, 'Rosogolla': 0xf1faee, 'Ghugni': 0xbc6c25, 'Mishti Doi': 0xd62828,
};

// The 8 characters: look + where they hang around.
const CHARACTERS = [
  { look: 'motaBabu', home: [10, 8], roam: 9 }, // big-bellied babu in dhoti-panjabi
  { look: 'teen', home: [60, -18], roam: 5 }, // teen in a new Puja kurta, taking selfies near Santosh Mitra Square
  { look: 'mashima', home: [-112, -98], roam: 8 }, // aunty in red-bordered white saree
  { look: 'purohit', home: [40, 82], roam: 4 }, // priest near Deshapriya Park
  { look: 'phuchkawala', home: [42, -8.8], roam: 1.5 }, // at the phuchka stall on the east-west road
  { look: 'jhalmuriwala', home: [-66, -90], roam: 6 }, // jhalmuri seller with a tin box round his neck
  { look: 'student', home: [-40, -48], roam: 10 }, // College Street student with jhola
  { look: 'kid', home: [-20, 108], roam: 7 }, // kid with a balloon
];

function label(text, color = '#fff7e0', bg = 'rgba(0,0,0,0.6)', w = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, w - 8, 56, 14);
  g.fill();
  g.fillStyle = color;
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, 33, w - 20);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Food stall: wooden cart, striped canopy, food on the counter, a lamp, a sign.
// ---------------------------------------------------------------------------
function buildStall(food) {
  const g = new THREE.Group();
  const color = FOOD_COLORS[food] || 0xe76f51;
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
  const cart = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.4), wood);
  cart.position.y = 0.75;
  g.add(cart);
  for (const x of [-0.9, 0.9]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.35, 0.75);
    g.add(wheel);
  }
  // striped canopy
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 1.9),
      new THREE.MeshStandardMaterial({ color: i % 2 ? color : 0xfff3e0 })
    );
    stripe.position.set(-1.25 + i * 0.5, 2.55, 0);
    stripe.rotation.x = 0.15;
    g.add(stripe);
  }
  for (const x of [-1.2, 1.2]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), wood);
    pole.position.set(x, 2.0, -0.6);
    g.add(pole);
  }
  // food: a heap / pot on the counter
  const foodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  if (food === 'Phuchka' || food === 'Rosogolla') {
    for (let i = 0; i < 9; i++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: food === 'Phuchka' ? 0xd9a441 : 0xfdfcf5 }));
      ball.position.set(-0.6 + (i % 3) * 0.28, 1.42 + Math.floor(i / 3) * 0.12, -0.1 + Math.floor(i / 3) * 0.05);
      g.add(ball);
    }
  } else {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.4, 12), foodMat);
    pot.position.set(-0.5, 1.5, 0);
    g.add(pot);
  }
  // hanging lamp that glows at night
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c1, emissive: 0xffc46b, emissiveIntensity: 1.4 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lampMat);
  lamp.position.set(0.6, 2.25, 0.2);
  g.add(lamp);
  // sign
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: label(food, '#2a1404', 'rgba(255,204,51,0.95)', 320) }));
  sign.scale.set(3.0, 0.6, 1);
  sign.position.y = 3.3;
  g.add(sign);
  return g;
}

// ---------------------------------------------------------------------------
// Characters: simple low-poly people built from basic shapes.
// ---------------------------------------------------------------------------
const SKIN = [0x8d5524, 0xa0673a, 0xc68642, 0x7a4a24];

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
}

// The 8 playable characters, in menu order: [look id, label shown in the menu]
export const PLAYABLE = [
  ['motaBabu', 'Mota Babu'], ['teen', 'Puja Teen'], ['mashima', 'Mashima'], ['purohit', 'Purohit'],
  ['phuchkawala', 'Phuchkawala'], ['jhalmuriwala', 'Jhalmuriwala'], ['student', 'Student'], ['kid', 'Kid'],
];

// Walk animation for a character model: swing legs and arms while moving.
export function animateCharacter(group, moving, t) {
  const swing = moving ? Math.sin(t * 9) * 0.55 : 0;
  const { legs = [], arms = [], look } = group.userData;
  legs.forEach((leg, k) => (leg.rotation.x = k ? swing : -swing));
  if (look === 'teen' && arms[1]) {
    arms[1].rotation.x = -2.3; // phone up for a selfie
    if (arms[0]) arms[0].rotation.x = swing * 0.6;
  } else {
    arms.forEach((arm, k) => (arm.rotation.x = k ? -swing * 0.6 : swing * 0.6));
  }
  group.traverse((o) => {
    if (o.userData.smoke) { o.position.y = 1.6 + ((t * 0.6) % 1) * 0.8; o.material.opacity = 0.45 * (1 - ((t * 0.6) % 1)); }
    if (o.userData.balloon) o.position.y = 3.1 + Math.sin(t * 2) * 0.1;
  });
}

export function buildCharacter(look, i = 0) {
  const g = new THREE.Group();
  const skin = mat(SKIN[i % SKIN.length]);
  let height = 1;
  let belly = 0;
  let top = 0xf5f5f0; // kurta / shirt colour
  let bottom = 0xf8f8f2; // dhoti / trousers colour
  let skirt = true; // dhoti or saree (one piece below the waist)
  const extras = [];

  switch (look) {
    case 'motaBabu':
      belly = 0.55; top = 0xfdfdf8; bottom = 0xfffdf5; break;
    case 'teen':
      top = 0xd00070; bottom = 0x1d3557; skirt = false; break; // bright new Puja kurta + jeans
    case 'mashima':
      top = 0xfbf7ee; bottom = 0xfbf7ee; break;
    case 'purohit':
      top = 0xe85d04; bottom = 0xf48c06; break;
    case 'phuchkawala':
      top = 0xe9edc9; bottom = 0x6c757d; break;
    case 'jhalmuriwala':
      top = 0xf1f1e6; bottom = 0x2a6f97; break; // vest + checked lungi
    case 'student':
      top = 0x3a86ff; bottom = 0x1d3557; skirt = false; break;
    case 'kid':
      height = 0.6; top = 0xffbe0b; bottom = 0x3a5a40; skirt = false; break;
    default: break;
  }

  const legs = [];
  if (skirt) {
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.42 + belly * 0.3, 0.55 + belly * 0.3, 1.0, 10), mat(bottom));
    lower.position.y = 0.5;
    g.add(lower);
    if (look === 'mashima') {
      // red border of the laal-paar saree, plus the anchal over the shoulder
      const border = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.57, 0.14, 10), mat(0xc1121f));
      border.position.y = 0.08;
      const anchal = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.5), mat(0xc1121f));
      anchal.position.set(0.25, 1.45, 0);
      anchal.rotation.z = 0.5;
      g.add(border, anchal);
    }
  } else {
    for (const x of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 6), mat(bottom));
      leg.geometry.translate(0, -0.5, 0); // pivot at the hip so it can swing
      leg.position.set(x, 1.0, 0);
      g.add(leg);
      legs.push(leg);
    }
  }

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 10), mat(top));
  torso.position.y = 1.45;
  g.add(torso);
  if (belly) {
    const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.4 + belly * 0.3, 12, 10), mat(top));
    tummy.position.set(0, 1.3, 0.18);
    tummy.scale.set(1.05, 0.95, 1);
    g.add(tummy);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 6), look === 'teen' || look === 'student' ? mat(top) : skin);
    arm.geometry.translate(0, -0.4, 0);
    arm.position.set(side * (0.42 + belly * 0.35), 1.85, 0);
    arm.rotation.z = side * (0.15 + belly * 0.2);
    g.add(arm);
    arms.push(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 2.15;
  g.add(head);

  // hair / headwear / props
  if (look === 'mashima') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0x111111));
    bun.position.set(0, 2.2, -0.25);
    const bindi = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), mat(0xd00000));
    bindi.position.set(0, 2.22, 0.26);
    extras.push(bun, bindi);
  } else if (look === 'purohit') {
    const tiki = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), mat(0x111111));
    tiki.position.set(0, 2.45, -0.12);
    // dhunuchi (incense burner) in hand with a puff of smoke
    const dhunuchi = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.08, 0.2, 10), mat(0x9c6644));
    dhunuchi.position.set(0.55, 1.25, 0.3);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd, transparent: true, opacity: 0.45 }));
    smoke.position.set(0.55, 1.6, 0.3);
    smoke.userData.smoke = true;
    extras.push(tiki, dhunuchi, smoke);
  } else if (look === 'jhalmuriwala') {
    // tin jhalmuri box hung at the chest, with a cone of muri on top
    const box = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.7, roughness: 0.35 }));
    box.position.set(0, 1.35, 0.55);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), mat(0xf4e1b5));
    cone.rotation.x = Math.PI;
    cone.position.set(0.15, 1.75, 0.55);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 4, 16, Math.PI), mat(0x5c3d1e));
    strap.position.set(0, 1.55, 0.25);
    const gamchha = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 6, 12), mat(0xd62828));
    gamchha.rotation.x = Math.PI / 2;
    gamchha.position.y = 2.33; // gamchha tied round the head
    extras.push(box, cone, strap, gamchha);
  } else if (look === 'teen') {
    // phone held up for a selfie, stylish hair
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.03), mat(0x111111));
    phone.position.set(0.5, 2.35, 0.45);
    phone.rotation.y = Math.PI;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x1a0f08));
    hair.position.y = 2.2;
    hair.scale.y = 1.3;
    const stole = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.12), mat(0xffbe0b));
    stole.position.set(0, 1.9, 0.3);
    extras.push(phone, hair, stole);
  } else if (look === 'student') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x111111));
    hair.position.y = 2.17;
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.05), mat(0x111111));
    glasses.position.set(0, 2.18, 0.26);
    const jhola = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.45), mat(0xc9a227));
    jhola.position.set(-0.45, 1.2, 0);
    extras.push(hair, glasses, jhola);
  } else if (look === 'kid') {
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4), mat(0xffffff));
    string.position.set(0.45, 2.3, 0);
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(0xff006e));
    balloon.position.set(0.45, 3.1, 0);
    balloon.userData.balloon = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x111111));
    hair.position.y = 2.17;
    extras.push(string, balloon, hair);
  } else if (look === 'phuchkawala') {
    const gamchha = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.35), mat(0xd62828));
    gamchha.position.set(0.3, 1.7, 0);
    gamchha.rotation.z = -0.3;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x111111));
    hair.position.y = 2.17;
    extras.push(gamchha, hair);
  } else if (look === 'motaBabu') {
    // balding with a fringe, round specs and a black umbrella
    const fringe = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12), mat(0x9a9a9a));
    fringe.rotation.x = Math.PI / 2;
    fringe.position.y = 2.18;
    const specs = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12), mat(0x111111));
    specs.position.set(0, 2.18, 0.26);
    const umbrella = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), mat(0x111111));
    umbrella.position.set(-0.75, 1.0, 0.1);
    extras.push(fringe, specs, umbrella);
  }
  extras.forEach((m) => g.add(m));

  g.scale.setScalar(height);
  g.userData = { legs, arms, look };
  return g;
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Puja crowd: hundreds of simple people (one draw call per body part) in Bengali
// festive clothes — red-and-white and bright sarees, panjabis, dhotis — packed
// around pandals and busy crossings, gently swaying as if moving in a queue.
// ---------------------------------------------------------------------------
const SAREES = [0xc1121f, 0xffffff, 0xf77f00, 0xd00070, 0xffbe0b, 0x7b2cbf, 0x2a9d8f, 0xe63946, 0xf4a261];
const PANJABIS = [0xfdfdf8, 0xffd166, 0x3a86ff, 0xef476f, 0x06d6a0, 0xf8f1e5, 0x9b5de5, 0xff9f1c];
const LOWERS = [0xfffdf5, 0x1d3557, 0x2b2d42, 0xf1faee, 0x6c757d];

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function buildCrowd(scene, world, data) {
  const rand = seeded(2025);
  const spots = [];
  const free = (x, z) => !world.colliders.some((c) => x > c.minX - 0.5 && x < c.maxX + 0.5 && z > c.minZ - 0.5 && z < c.maxZ + 0.5);
  // A ring of people in front of / around each pandal (more at big ones), plus the crowd zones
  for (const p of data.pandals || []) {
    const n = p.type === 'ghetto' ? 10 : 34;
    const entry = world.pandals?.get(p.id)?.group;
    const face = entry ? entry.rotation.y : 0;
    for (let i = 0; i < n; i++) {
      // mostly in front of the entrance, queueing toward it
      const a = face + (rand() - 0.5) * (p.type === 'ghetto' ? 2.2 : 2.6);
      const r = (p.type === 'ghetto' ? 5 : 15) + rand() * (p.type === 'ghetto' ? 4 : 12);
      spots.push([p.x + Math.sin(a) * r, p.z + Math.cos(a) * r]);
    }
  }
  for (const c of data.crowdZones || []) {
    const n = c.intensity === 'jhamela' ? 40 : 18;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * c.radius * 0.9;
      spots.push([c.x + Math.cos(a) * r, c.z + Math.sin(a) * r]);
    }
  }
  const people = spots.filter(([x, z]) => free(x, z) && Math.hypot(x, z) > 6).map(([x, z]) => {
    const woman = rand() < 0.5;
    return {
      x, z, woman,
      hx: x, hz: z, tx: x, tz: z, // home spot and current walking target
      spd: 0.7 + rand() * 0.8,
      wait: rand() * 3,
      rot: rand() * Math.PI * 2,
      s: 0.85 + rand() * 0.25,
      lower: woman ? SAREES[Math.floor(rand() * SAREES.length)] : LOWERS[Math.floor(rand() * LOWERS.length)],
      upper: woman ? SAREES[Math.floor(rand() * SAREES.length)] : PANJABIS[Math.floor(rand() * PANJABIS.length)],
      border: rand() < 0.5,
      phase: rand() * 10,
    };
  });

  const count = Math.max(1, people.length);
  const lowerMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.45, 1.0, 8), new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
  const upperMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.26, 0.32, 0.75, 8), new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
  const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9a6338, roughness: 0.8 }), count);
  const hairMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.23, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.8), new THREE.MeshStandardMaterial({ color: 0x15100c }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  people.forEach((p, i) => {
    lowerMesh.setColorAt(i, col.setHex(p.lower));
    upperMesh.setColorAt(i, col.setHex(p.upper));
  });

  const BODY = 0.38; // how wide a person is, for bumping into them
  let playerX = 1e9;
  let playerZ = 1e9;

  // Each person strolls to random spots near their home, pauses, then moves on.
  function walk(dt) {
    for (const p of people) {
      if (p.wait > 0) { p.wait -= dt; p.moving = false; continue; }
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) {
        const a = rand() * Math.PI * 2;
        const r = rand() * 5;
        p.tx = p.hx + Math.cos(a) * r;
        p.tz = p.hz + Math.sin(a) * r;
        p.wait = 0.5 + rand() * 3;
        continue;
      }
      const step = Math.min(d, p.spd * dt);
      const nx = p.x + (dx / d) * step;
      const nz = p.z + (dz / d) * step;
      // don't walk through buildings or into the player
      if (!free(nx, nz) || Math.hypot(nx - playerX, nz - playerZ) < 1.3) {
        p.tx = p.x; p.tz = p.z; p.wait = 0.4 + rand();
        p.moving = false;
        continue;
      }
      p.x = nx;
      p.z = nz;
      p.rot = Math.atan2(dx, dz);
      p.moving = true;
    }
  }

  // Is (x, z) bumping into someone? Moving away from a person is always allowed,
  // so you can never get stuck inside the crowd.
  function blocks(x, z, r, fromX, fromZ) {
    const lim = (BODY + r) ** 2;
    for (const p of people) {
      const dNew = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dNew >= lim) continue;
      if (fromX === undefined) return true;
      const dOld = (p.x - fromX) ** 2 + (p.z - fromZ) ** 2;
      if (dNew < dOld) return true;
    }
    return false;
  }

  function place(t, dt = 0) {
    if (dt > 0) walk(dt);
    people.forEach((p, i) => {
      const sway = Math.sin(t * (p.moving ? 7 : 1.6) + p.phase) * (p.moving ? 0.08 : 0.04);
      const bob = Math.abs(Math.sin(t * (p.moving ? 7 : 2.2) + p.phase)) * (p.moving ? 0.08 : 0.04);
      q.setFromEuler(e.set(0, p.rot + sway * 3, sway));
      sc.set(p.s, p.s, p.s);
      m.compose(v.set(p.x, (0.5 + bob) * p.s, p.z), q, sc);
      lowerMesh.setMatrixAt(i, m);
      m.compose(v.set(p.x, (1.35 + bob) * p.s, p.z), q, sc);
      upperMesh.setMatrixAt(i, m);
      m.compose(v.set(p.x, (1.92 + bob) * p.s, p.z), q, sc);
      headMesh.setMatrixAt(i, m);
      m.compose(v.set(p.x, (1.97 + bob) * p.s, p.z), q, sc);
      hairMesh.setMatrixAt(i, m);
    });
    for (const mesh of [lowerMesh, upperMesh, headMesh, hairMesh]) mesh.instanceMatrix.needsUpdate = true;
  }
  [lowerMesh, upperMesh, headMesh, hairMesh].forEach((mesh) => { mesh.count = people.length; scene.add(mesh); });
  place(0);
  return {
    count: people.length,
    update: place,
    blocks,
    setPlayer(x, z) { playerX = x; playerZ = z; },
  };
}

// ---------------------------------------------------------------------------
// Bengali Puja touches: alpana floor art at pandal entrances, marigold garlands
// strung across the roads, kash flowers along the river, and "Subho Sharodiya"
// welcome arches on the main roads.
// ---------------------------------------------------------------------------
function alpanaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.translate(128, 128);
  g.strokeStyle = '#fffaf0';
  g.fillStyle = '#fffaf0';
  g.lineWidth = 5;
  for (const r of [30, 60, 95, 120]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < 12; i++) {
    // lotus petals
    g.save(); g.rotate((i / 12) * Math.PI * 2);
    g.beginPath(); g.moveTo(0, -32); g.quadraticCurveTo(18, -60, 0, -92); g.quadraticCurveTo(-18, -60, 0, -32); g.stroke();
    g.beginPath(); g.arc(0, -108, 7, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.fillStyle = '#c1121f';
  g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function archTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = '#9d0208';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#ffd166';
  g.lineWidth = 6;
  g.strokeRect(5, 5, 502, 86);
  g.fillStyle = '#ffd166';
  g.font = 'bold 40px system-ui, "Noto Sans Bengali", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('শুভ শারদীয়া · Subho Sharodiya', 256, 50, 490);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildBengaliTouches(scene, world, data) {
  const rand = seeded(1971);
  // Alpana in front of every pandal entrance
  const alpanaMat = new THREE.MeshBasicMaterial({ map: alpanaTexture(), transparent: true, depthWrite: false, opacity: 0.9 });
  for (const p of data.pandals || []) {
    const entry = world.pandals?.get(p.id)?.group;
    const face = entry ? entry.rotation.y : 0;
    const dist = p.type === 'ghetto' ? 4.5 : 14;
    const size = p.type === 'ghetto' ? 3.5 : 7;
    const al = new THREE.Mesh(new THREE.PlaneGeometry(size, size), alpanaMat);
    al.rotation.x = -Math.PI / 2;
    al.position.set(p.x + Math.sin(face) * dist, 0.05, p.z + Math.cos(face) * dist);
    scene.add(al);
  }

  // Marigold garlands (orange + yellow) strung across the roads near pandals
  const pts = [];
  const colors = [];
  const c = new THREE.Color();
  for (const r of data.roads || []) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const nx = -(r.z2 - r.z1) / len;
    const nz = (r.x2 - r.x1) / len;
    for (let d = 15; d < len; d += 18) {
      const t = d / len;
      const cx = r.x1 + (r.x2 - r.x1) * t;
      const cz = r.z1 + (r.z2 - r.z1) * t;
      const nearP = (data.pandals || []).some((p) => Math.hypot(p.x - cx, p.z - cz) < 45);
      if (!nearP) continue;
      for (let k = 0; k <= 40; k++) {
        const s = k / 40 - 0.5;
        const sag = (1 - (2 * s) ** 2) * 1.4;
        pts.push(cx + nx * s * 12, 7.5 - sag, cz + nz * s * 12);
        c.setHex(k % 3 === 0 ? 0xffb703 : 0xfb8500);
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  const garlandGeo = new THREE.BufferGeometry();
  garlandGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  garlandGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Points(garlandGeo, new THREE.PointsMaterial({ size: 0.42, vertexColors: true })));

  // Kash flowers (the white feathery grass of Sharad) along the riverbank
  const kashCount = 140;
  const kashGeo = new THREE.ConeGeometry(0.18, 1.6, 5);
  kashGeo.translate(0, 0.8, 0);
  const kash = new THREE.InstancedMesh(kashGeo, new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 1 }), kashCount);
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.03, 1.2, 4);
  stemGeo.translate(0, 0.6, 0);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0x8a9a5b }), kashCount);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < kashCount; i++) {
    const x = -142 + rand() * 6;
    const z = -150 + rand() * 300;
    q.setFromEuler(e.set((rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4));
    m.compose(v.set(x, 0, z), q, one);
    stems.setMatrixAt(i, m);
    m.compose(v.set(x, 1.1, z), q, one);
    kash.setMatrixAt(i, m);
  }
  scene.add(kash, stems);

  // "Subho Sharodiya" welcome arches over the main roads
  const archTex = archTexture();
  const archMat = new THREE.MeshBasicMaterial({ map: archTex, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb703, emissiveIntensity: 0.3 });
  for (const [x, z, along] of [[0, -30, 'z'], [0, 60, 'z'], [-30, 0, 'x'], [70, 0, 'x'], [90, -100, 'z'], [-110, 100, 'z']]) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 8), poleMat);
      pole.position.set(s * 5.6, 4, 0);
      g.add(pole);
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 2.1), archMat);
    banner.position.y = 8;
    g.add(banner);
    g.position.set(x, 0, z);
    g.rotation.y = along === 'z' ? 0 : Math.PI / 2;
    scene.add(g);
  }
}

export function buildCityLife(scene, world, data = {}) {
  const blocked = (x, z, pad) =>
    world.colliders.some((c) => x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad);

  // Stalls
  const stalls = [];
  STALLS.forEach(([food, x, z], i) => {
    if (blocked(x, z, 1.2)) return; // keep footpaths clear of buildings and taxis
    const group = buildStall(food);
    // face the road: stalls on +x/-x side of a vertical road face it, etc.
    const onVertical = Math.abs(Math.abs(x) % 1 - 0.4) < 0.01 || Math.abs(Math.abs(x) % 1 - 0.6) < 0.01;
    group.rotation.y = onVertical ? (x % 10 > 0 ? -Math.PI / 2 : Math.PI / 2) : (z % 10 > 0 ? Math.PI : 0);
    group.position.set(x, 0, z);
    scene.add(group);
    world.colliders.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 1.1, maxZ: z + 1.1 });
    stalls.push({ id: `stall-${i}`, food, x, z, group });
  });

  // Puja crowds and Bengali decorations
  const crowd = buildCrowd(scene, world, data);
  // let the player bump into the crowd (player.js checks this)
  world.blockedByCrowd = (x, z, r, fromX, fromZ) => crowd.blocks(x, z, r, fromX, fromZ);
  buildBengaliTouches(scene, world, data);

  // The characters are now playable (picked in the menu), so none wander the streets.
  const people = [].map((c, i) => {
    const group = buildCharacter(c.look, i);
    const name = CHARACTER_NAMES[i];
    if (name) {
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: label(name), depthTest: false }));
      tag.scale.set(2.6, 0.65, 1);
      tag.position.y = 2.9 / (c.look === 'kid' ? 0.6 : 1);
      tag.renderOrder = 10;
      group.add(tag);
    }
    group.position.set(c.home[0], 0, c.home[1]);
    scene.add(group);
    return { ...c, group, phase: i * 1.7, speed: c.look === 'motaBabu' ? 0.35 : c.look === 'kid' ? 0.9 : 0.55 };
  });

  let t = 0;
  let crowdTick = 0;
  function update(dt) {
    t += dt;
    if (++crowdTick % 2 === 0) crowd.update(t, dt * 2); // walk + sway, every other frame to save phones
    for (const p of people) {
      const { group } = p;
      // walk in a slow loop around their spot; the dhaki and purohit mostly stay put
      const a = t * p.speed * (2 / Math.max(2, p.roam)) + p.phase;
      const x = p.home[0] + Math.cos(a) * p.roam;
      const z = p.home[1] + Math.sin(a) * p.roam * 0.6;
      const dx = x - group.position.x;
      const dz = z - group.position.z;
      if (!blocked(x, z, 0.4)) group.position.set(x, 0, z);
      const moving = Math.hypot(dx, dz) > 0.0005;
      if (moving) group.rotation.y = Math.atan2(dx, dz);
      const swing = moving ? Math.sin(t * 8 + p.phase) * 0.5 : 0;
      group.userData.legs.forEach((leg, k) => (leg.rotation.x = k ? swing : -swing));
      if (p.look === 'teen') {
        // right arm held up for a selfie, left arm swings
        group.userData.arms[1].rotation.x = -2.3;
        group.userData.arms[0].rotation.x = swing * 0.6;
      } else {
        group.userData.arms.forEach((arm, k) => (arm.rotation.x = k ? -swing * 0.6 : swing * 0.6));
      }
      group.position.y = moving ? Math.abs(Math.sin(t * 8 + p.phase)) * 0.05 : 0;
      group.traverse((o) => {
        if (o.userData.smoke) { o.position.y = 1.6 + ((t * 0.6) % 1) * 0.8; o.material.opacity = 0.45 * (1 - ((t * 0.6) % 1)); }
        if (o.userData.balloon) o.position.y = 3.1 + Math.sin(t * 2) * 0.1;
      });
    }
  }

  function nearestStall(x, z, radius) {
    let best = null;
    for (const s of stalls) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d <= radius && (!best || d < best.d)) best = { ...s, d };
    }
    return best;
  }

  return { stalls, nearestStall, update, crowdCount: crowd.count, setPlayer: crowd.setPlayer };
}
