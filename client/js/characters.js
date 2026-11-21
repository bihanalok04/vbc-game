// The 8 playable characters, modelled after the team's character sheet:
// Phuchkawala, Purohit, Mota Babu, Puja Teen, Mashima, Purohit with the ghanta
// (bell), Student and Kid. Built from simple shapes in a soft, toy-like style.
// Every model faces +Z and stands on y = 0.
import * as THREE from 'three';

export const PLAYABLE = [
  ['phuchkawala', 'Phuchkawala'], ['purohit', 'Purohit'], ['motaBabu', 'Mota Babu'], ['teen', 'Puja Teen'],
  ['mashima', 'Mashima'], ['purohitBell', 'Purohit (Ghanta)'], ['student', 'Student'], ['kid', 'Kid'],
];

const SKIN = { light: 0xd9a066, mid: 0xc68642, deep: 0xa0673a };
const WHITE = 0xfbf8f0;
const RED = 0xc1121f;
const GOLD = 0xf2c14e;

const mats = new Map();
function mat(color, opts = {}) {
  const key = `${color}-${opts.metal || 0}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: opts.metal ? 0.3 : 0.75, metalness: opts.metal || 0 }));
  }
  return mats.get(key);
}

function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

// Head with a friendly cartoon face. Returns the head group.
function head(parent, skin, y, { hair = 'short', hairColor = 0x1a120c, glasses = false, moustache = false, tilak = false, bindi = false, big = 1 } = {}) {
  const h = new THREE.Group();
  h.position.y = y;
  h.scale.setScalar(big);
  parent.add(h);
  add(h, new THREE.SphereGeometry(0.3, 18, 14), mat(skin));
  for (const s of [-1, 1]) {
    add(h, new THREE.SphereGeometry(0.075, 10, 8), mat(0xffffff), s * 0.1, 0.03, 0.25); // eye white
    add(h, new THREE.SphereGeometry(0.045, 8, 6), mat(0x2b1a10), s * 0.1, 0.03, 0.31); // pupil
    add(h, new THREE.BoxGeometry(0.11, 0.025, 0.03), mat(0x2b1a10), s * 0.1, 0.13, 0.27, 0, 0, s * -0.12); // brow
    add(h, new THREE.SphereGeometry(0.06, 8, 6), mat(skin), s * 0.3, 0, 0); // ear
  }
  add(h, new THREE.SphereGeometry(0.045, 8, 6), mat(skin), 0, -0.04, 0.3); // nose
  add(h, new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI), mat(0x7a2e1e), 0, -0.12, 0.27, 0, 0, Math.PI); // smile
  if (moustache) add(h, new THREE.TorusGeometry(0.09, 0.03, 6, 12, Math.PI), mat(0x1a120c), 0, -0.07, 0.28, 0, 0, 0);
  if (tilak) add(h, new THREE.BoxGeometry(0.03, 0.08, 0.02), mat(RED), 0, 0.2, 0.28);
  if (bindi) add(h, new THREE.SphereGeometry(0.025, 6, 4), mat(RED), 0, 0.17, 0.29);
  if (glasses) {
    for (const s of [-1, 1]) add(h, new THREE.TorusGeometry(0.075, 0.012, 6, 14), mat(0x111111), s * 0.1, 0.03, 0.3);
    add(h, new THREE.BoxGeometry(0.06, 0.012, 0.01), mat(0x111111), 0, 0.04, 0.31);
  }
  const hm = mat(hairColor);
  if (hair === 'short' || hair === 'wavy' || hair === 'messy') {
    add(h, new THREE.SphereGeometry(0.315, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), hm, 0, 0.03, -0.01);
    const tufts = hair === 'short' ? 3 : 7;
    for (let i = 0; i < tufts; i++) {
      const a = (i / tufts) * Math.PI - Math.PI / 2;
      add(h, new THREE.SphereGeometry(0.11, 8, 6), hm, Math.sin(a) * 0.18, 0.27, 0.1 + Math.cos(a) * 0.08);
    }
  } else if (hair === 'bald') {
    // bald on top, a ring of hair round the sides and back
    add(h, new THREE.TorusGeometry(0.27, 0.06, 6, 16, Math.PI * 1.3), hm, 0, 0.02, -0.03, Math.PI / 2, 0, Math.PI * 0.85);
  } else if (hair === 'bun') {
    add(h, new THREE.SphereGeometry(0.315, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0.03, -0.01);
    add(h, new THREE.SphereGeometry(0.15, 10, 8), hm, 0, 0.05, -0.32);
    for (const s of [-1, 1]) add(h, new THREE.SphereGeometry(0.03, 6, 4), mat(GOLD, { metal: 0.8 }), s * 0.31, -0.1, 0); // earrings
  } else if (hair === 'slick') {
    add(h, new THREE.SphereGeometry(0.315, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), hm, 0, 0.05, -0.02);
  }
  return h;
}

// Arm with a hand, pivoting at the shoulder.
function arm(parent, side, y, sleeveColor, skin, { width = 0.36, short = false, len = 0.75 } = {}) {
  const pivot = new THREE.Group();
  pivot.position.set(side * width, y, 0);
  parent.add(pivot);
  const upper = short ? len * 0.35 : len * 0.95;
  add(pivot, new THREE.CylinderGeometry(0.09, 0.08, upper, 8), mat(sleeveColor), 0, -upper / 2, 0);
  if (short) add(pivot, new THREE.CylinderGeometry(0.065, 0.06, len * 0.6, 8), mat(skin), 0, -upper - len * 0.3, 0);
  add(pivot, new THREE.SphereGeometry(0.08, 8, 6), mat(skin), 0, -len - 0.02, 0);
  pivot.rotation.z = side * 0.08;
  return pivot;
}

// Trousers / shorts legs with shoes, pivoting at the hip.
function legs(parent, color, shoe, { hip = 0.95, len = 0.95, shortsSkin = null } = {}) {
  const out = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.15, hip, 0);
    parent.add(pivot);
    if (shortsSkin) {
      add(pivot, new THREE.CylinderGeometry(0.13, 0.12, len * 0.4, 8), mat(color), 0, -len * 0.2, 0);
      add(pivot, new THREE.CylinderGeometry(0.07, 0.065, len * 0.6, 8), mat(shortsSkin), 0, -len * 0.7, 0);
    } else {
      add(pivot, new THREE.CylinderGeometry(0.12, 0.1, len, 8), mat(color), 0, -len / 2, 0);
    }
    add(pivot, new THREE.BoxGeometry(0.17, 0.1, 0.3), mat(shoe), 0, -len - 0.02, 0.06);
    out.push(pivot);
  }
  return out;
}

// Dhoti or saree: a flared white drape with red border stripes, plus feet below.
function drape(parent, { top = 0.98, bottomY = 0.12, topR = 0.32, botR = 0.42, color = WHITE, stripes = 1, feet = 0x6b3e1f } = {}) {
  const h = top - bottomY;
  add(parent, new THREE.CylinderGeometry(topR, botR, h, 14), mat(color), 0, bottomY + h / 2, 0);
  for (let i = 0; i < stripes; i++) {
    add(parent, new THREE.CylinderGeometry(botR + 0.005 - i * 0.004, botR + 0.008 - i * 0.004, 0.045, 14), mat(RED), 0, bottomY + 0.04 + i * 0.09, 0);
  }
  // the front pleat (kochi) with its red edge
  add(parent, new THREE.BoxGeometry(0.06, h * 0.85, 0.04), mat(RED), 0.08, bottomY + h * 0.45, botR * 0.9);
  const feetOut = [];
  for (const s of [-1, 1]) {
    const shin = new THREE.Group();
    shin.position.set(s * 0.14, bottomY + 0.02, 0);
    parent.add(shin);
    add(shin, new THREE.BoxGeometry(0.16, 0.06, 0.3), mat(feet), 0, -0.06, 0.06); // sandal / shoe
    feetOut.push(shin);
  }
  return feetOut;
}

function torso(parent, color, { y = 1.32, h = 0.72, r = 0.3, belly = 0 } = {}) {
  add(parent, new THREE.CylinderGeometry(r, r + 0.05, h, 14), mat(color), 0, y, 0);
  if (belly) {
    const b = add(parent, new THREE.SphereGeometry(r + belly, 16, 12), mat(color), 0, y - 0.12, 0.1);
    b.scale.set(1.05, 0.95, 1);
  }
}

// ---------------------------------------------------------------------------

export function buildCharacter(look) {
  const g = new THREE.Group();
  let armsOut = [];
  let legsOut = [];
  let scale = 1;

  switch (look) {
    case 'phuchkawala': {
      const skin = SKIN.deep;
      legsOut = drape(g, { top: 0.98, bottomY: 0.35, topR: 0.3, botR: 0.36, stripes: 1, feet: 0x7a4a24 });
      for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.065, 0.06, 0.32, 8), mat(skin), s * 0.14, 0.2, 0); // shins
      torso(g, WHITE);
      add(g, new THREE.BoxGeometry(0.62, 0.05, 0.05), mat(0x3b2a1a), 0, 1.0, 0.3); // belt
      add(g, new THREE.BoxGeometry(0.16, 0.85, 0.08), mat(RED), 0.18, 1.35, 0.22, 0, 0, -0.25); // red gamchha over the shoulder
      armsOut = [arm(g, -1, 1.62, WHITE, skin, { short: true }), arm(g, 1, 1.62, WHITE, skin, { short: true })];
      head(g, skin, 2.0, { hair: 'wavy' });
      // phuchka cart with the glass jar of golden phuchkas
      const cart = new THREE.Group();
      cart.position.set(-0.85, 0, 0.1);
      add(cart, new THREE.BoxGeometry(0.6, 0.35, 0.6), mat(0x6b3e1f), 0, 0.75, 0);
      add(cart, new THREE.TorusGeometry(0.3, 0.04, 6, 16), mat(0x3b2a1a), 0, 0.32, 0.32);
      const jar = add(cart, new THREE.CylinderGeometry(0.26, 0.26, 0.45, 14), new THREE.MeshStandardMaterial({ color: 0xdfe9f0, transparent: true, opacity: 0.35, roughness: 0.1 }), 0, 1.16, 0);
      jar.renderOrder = 2;
      for (let i = 0; i < 10; i++) add(cart, new THREE.SphereGeometry(0.07, 8, 6), mat(0xd9a441), Math.cos(i) * 0.12, 1.0 + (i % 3) * 0.1, Math.sin(i) * 0.12);
      add(cart, new THREE.CylinderGeometry(0.28, 0.28, 0.05, 14), mat(0x8a8a8a, { metal: 0.6 }), 0, 1.41, 0);
      g.add(cart);
      break;
    }
    case 'purohit':
    case 'purohitBell': {
      const skin = SKIN.mid;
      legsOut = drape(g, { top: 1.0, bottomY: 0.12, topR: 0.3, botR: 0.38, stripes: 1, feet: look === 'purohit' ? 0x7a4a24 : 0x111111 });
      torso(g, WHITE, { r: 0.27 });
      // uttariya: shawl draped diagonally with a red border
      add(g, new THREE.BoxGeometry(0.1, 0.95, 0.42), mat(WHITE), 0.12, 1.32, 0.05, 0, 0, 0.45);
      add(g, new THREE.BoxGeometry(0.04, 0.95, 0.43), mat(RED), 0.17, 1.32, 0.06, 0, 0, 0.45);
      // rudraksha mala
      add(g, new THREE.TorusGeometry(0.2, 0.035, 6, 18), mat(0x5c3317), 0, 1.55, 0.2, 1.2, 0, 0);
      armsOut = [arm(g, -1, 1.62, skin, skin, { width: 0.33 }), arm(g, 1, 1.62, skin, skin, { width: 0.33 })];
      head(g, skin, 2.0, { hair: 'bald', hairColor: 0x2b2b2b, glasses: true, tilak: true });
      if (look === 'purohit') {
        add(armsOut[0], new THREE.BoxGeometry(0.22, 0.3, 0.07), mat(0x6b3e1f), 0, -0.75, 0.12); // holy book
      } else {
        // brass ghanta (bell) in hand
        add(armsOut[1], new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), mat(GOLD, { metal: 0.8 }), 0, -0.82, 0.1);
        add(armsOut[1], new THREE.ConeGeometry(0.13, 0.22, 14, 1, true), mat(0xd4a017, { metal: 0.85 }), 0, -1.0, 0.1);
      }
      break;
    }
    case 'motaBabu': {
      const skin = SKIN.light;
      legsOut = drape(g, { top: 0.75, bottomY: 0.12, topR: 0.42, botR: 0.45, stripes: 1, feet: 0x3b2314 });
      // long white panjabi down to the knees, with a big belly
      add(g, new THREE.CylinderGeometry(0.42, 0.5, 0.9, 16), mat(WHITE), 0, 0.95, 0);
      torso(g, WHITE, { y: 1.45, h: 0.6, r: 0.38, belly: 0.28 });
      add(g, new THREE.TorusGeometry(0.2, 0.025, 6, 18), mat(GOLD, { metal: 0.9 }), 0, 1.68, 0.18, 1.2, 0, 0); // gold chain
      armsOut = [arm(g, -1, 1.68, WHITE, skin, { width: 0.5 }), arm(g, 1, 1.68, WHITE, skin, { width: 0.5 })];
      head(g, skin, 2.08, { hair: 'slick', moustache: true, tilak: true, big: 1.08 });
      break;
    }
    case 'teen': {
      const skin = SKIN.mid;
      legsOut = legs(g, 0xc8b593, 0x5a3e36);
      torso(g, 0x9b2335, { r: 0.28 });
      add(g, new THREE.BoxGeometry(0.2, 0.12, 0.05), mat(0x9b2335), 0, 1.66, 0.27); // collar
      armsOut = [arm(g, -1, 1.62, 0x9b2335, skin, { width: 0.34 }), arm(g, 1, 1.62, 0x9b2335, skin, { width: 0.34 })];
      add(armsOut[0], new THREE.TorusGeometry(0.07, 0.02, 6, 12), mat(0x111111), 0, -0.68, 0, Math.PI / 2, 0, 0); // wristband
      head(g, skin, 2.0, { hair: 'wavy' });
      break;
    }
    case 'mashima': {
      const skin = SKIN.light;
      legsOut = drape(g, { top: 1.02, bottomY: 0.1, topR: 0.32, botR: 0.46, stripes: 3, feet: 0x7a2e1e });
      torso(g, RED, { r: 0.3, h: 0.5, y: 1.42 }); // red blouse
      add(g, new THREE.CylinderGeometry(0.31, 0.33, 0.25, 14), mat(WHITE), 0, 1.08, 0); // saree at the waist
      // anchal over the shoulder, white with red stripes
      add(g, new THREE.BoxGeometry(0.12, 1.0, 0.5), mat(WHITE), 0.15, 1.28, 0.05, 0, 0, -0.5);
      add(g, new THREE.BoxGeometry(0.05, 1.0, 0.51), mat(RED), 0.11, 1.3, 0.06, 0, 0, -0.5);
      armsOut = [arm(g, -1, 1.62, RED, skin, { short: true, width: 0.36 }), arm(g, 1, 1.62, RED, skin, { short: true, width: 0.36 })];
      for (const a of armsOut) add(a, new THREE.TorusGeometry(0.075, 0.018, 6, 12), mat(GOLD, { metal: 0.9 }), 0, -0.66, 0, Math.PI / 2, 0, 0); // bangles
      head(g, skin, 1.98, { hair: 'bun', bindi: true });
      break;
    }
    case 'student': {
      const skin = SKIN.mid;
      legsOut = legs(g, 0x1f2a44, 0x111111);
      torso(g, 0xf3f6fb, { r: 0.28 });
      add(g, new THREE.BoxGeometry(0.08, 0.55, 0.03), mat(0x1d3557), 0, 1.4, 0.3); // tie
      add(g, new THREE.BoxGeometry(0.5, 0.65, 0.22), mat(0x2b2d42), 0, 1.38, -0.34); // backpack
      for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.06, 0.7, 0.04), mat(0x2b2d42), s * 0.18, 1.38, 0.29);
      armsOut = [arm(g, -1, 1.62, 0xf3f6fb, skin, { short: true, width: 0.34 }), arm(g, 1, 1.62, 0xf3f6fb, skin, { short: true, width: 0.34 })];
      add(armsOut[1], new THREE.BoxGeometry(0.22, 0.3, 0.06), mat(0x5c1a2b), 0, -0.72, 0.12); // book
      head(g, skin, 2.0, { hair: 'messy', glasses: true });
      break;
    }
    case 'kid':
    default: {
      const skin = SKIN.light;
      legsOut = legs(g, 0x2f5d9b, 0x3b4a7a, { shortsSkin: skin });
      torso(g, 0xffc93c, { r: 0.3 });
      add(g, new THREE.SphereGeometry(0.1, 10, 8), mat(0x3aa0c8), 0, 1.38, 0.3); // t-shirt print
      armsOut = [arm(g, -1, 1.62, 0xffc93c, skin, { short: true, width: 0.36 }), arm(g, 1, 1.62, 0xffc93c, skin, { short: true, width: 0.36 })];
      head(g, skin, 2.02, { hair: 'messy', big: 1.2 });
      scale = 0.68;
      break;
    }
  }

  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.userData = { legs: legsOut, arms: armsOut, look };
  return g;
}

// Walk animation: swing legs and arms while moving; idle sway otherwise.
export function animateCharacter(group, moving, t) {
  const { legs: lg = [], arms = [] } = group.userData;
  const swing = moving ? Math.sin(t * 9) * 0.55 : 0;
  lg.forEach((l, k) => (l.rotation.x = k ? swing : -swing));
  arms.forEach((a, k) => (a.rotation.x = (k ? -swing : swing) * 0.7 + (moving ? 0 : Math.sin(t * 1.5 + k) * 0.04)));
}
