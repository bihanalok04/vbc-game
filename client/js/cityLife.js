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

function buildCharacter(look, i) {
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
  g.userData = { legs, arms };
  return g;
}

// ---------------------------------------------------------------------------

export function buildCityLife(scene, world) {
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

  // Characters
  const people = CHARACTERS.map((c, i) => {
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
  function update(dt) {
    t += dt;
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

  return { stalls, nearestStall, update };
}
