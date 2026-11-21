// OWNER: Bihan (movement, third-person camera, sprint, stamina, controls).
//
// createPlayer(scene, camera, world, domElement)
// returns {
//   object,                      // THREE.Object3D of the local player
//   update(dt),                  // call every frame
//   getState(),                  // { x, y, z, rotY, anim, stamina, sprinting }
//   setPosition(x, z),           // spawn / server correction (player:correct)
//   setSpeedMultiplier(m),       // random events (effects.speedMultiplier)
//   setEnabled(bool),            // freeze during menus / countdown / results
//   setColor(hex),
// }
import * as THREE from 'three';
import { WALK_SPEED, SPRINT_SPEED, WORLD_HALF_SIZE } from './config.js';

const RADIUS = 0.6;
const STAMINA_DRAIN = 0.25; // per second while sprinting (4 s of full sprint)
const STAMINA_REGEN = 0.15; // per second while not sprinting
const STAMINA_MIN_RESTART = 0.2; // once empty, need this much before sprinting again
const CAM_DISTANCE = 9;
const CAM_HEIGHT = 4.5;

export function makeAvatar(color = 0xffcc33) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(RADIUS, 1.0, 4, 8), mat);
  body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe0ac69 }));
  head.position.y = 2.25;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.35), new THREE.MeshStandardMaterial({ color: 0xcc2222 }));
  nose.position.set(0, 2.25, 0.45);
  g.add(body, head, nose);
  g.userData.body = body;
  return g;
}

// ---------- touch controls (joystick + sprint button) ----------
function createTouchControls() {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="joy"><div id="joy-knob"></div></div>
    <button id="sprint-btn" type="button">SPRINT</button>`;
  document.body.appendChild(root);
  const joy = root.querySelector('#joy');
  const knob = root.querySelector('#joy-knob');
  const sprintBtn = root.querySelector('#sprint-btn');

  const state = { x: 0, y: 0, sprint: false };
  let joyId = null;
  const MAX = 45;

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function onMove(e) {
    const r = joy.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > MAX) { dx = (dx / len) * MAX; dy = (dy / len) * MAX; }
    setKnob(dx, dy);
    state.x = dx / MAX;
    state.y = -dy / MAX;
  }
  joy.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    onMove(e);
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) onMove(e); });
  const release = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    state.x = 0; state.y = 0;
    setKnob(0, 0);
  };
  joy.addEventListener('pointerup', release);
  joy.addEventListener('pointercancel', release);

  sprintBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); state.sprint = true; sprintBtn.classList.add('on'); });
  const stopSprint = () => { state.sprint = false; sprintBtn.classList.remove('on'); };
  sprintBtn.addEventListener('pointerup', stopSprint);
  sprintBtn.addEventListener('pointercancel', stopSprint);
  sprintBtn.addEventListener('pointerleave', stopSprint);

  // Show only on touch devices (or after the first touch).
  const show = () => document.body.classList.add('is-touch');
  if (window.matchMedia('(pointer: coarse)').matches) show();
  window.addEventListener('touchstart', show, { once: true, passive: true });

  return state;
}

export function createPlayer(scene, camera, world, domElement) {
  const object = makeAvatar();
  scene.add(object);

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const touch = createTouchControls();

  // Camera yaw: drag on the game canvas (mouse or one finger) to look around.
  let camYaw = Math.PI; // camera sits behind the player (player faces +Z)
  let dragId = null;
  let lastX = 0;
  domElement.addEventListener('pointerdown', (e) => { dragId = e.pointerId; lastX = e.clientX; });
  window.addEventListener('pointerup', (e) => { if (e.pointerId === dragId) dragId = null; });
  window.addEventListener('pointercancel', (e) => { if (e.pointerId === dragId) dragId = null; });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    camYaw -= (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
  });

  let stamina = 1;
  let sprinting = false;
  let exhausted = false;
  let speedMul = 1;
  let enabled = false;
  let anim = 'idle';
  let bob = 0;

  function blocked(x, z) {
    for (const c of world.colliders) {
      if (x > c.minX - RADIUS && x < c.maxX + RADIUS && z > c.minZ - RADIUS && z < c.maxZ + RADIUS) return true;
    }
    return false;
  }

  const camTarget = new THREE.Vector3();

  function update(dt) {
    // Input in camera space: fx = right, fz = forward.
    let fx = 0, fz = 0;
    if (enabled) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
      fx += touch.x;
      fz += touch.y;
    }
    let mag = Math.hypot(fx, fz);
    const moving = mag > 0.15;

    const wantSprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.sprint;
    if (stamina <= 0) exhausted = true;
    if (exhausted && stamina >= STAMINA_MIN_RESTART) exhausted = false;
    sprinting = moving && wantSprint && !exhausted;
    stamina = sprinting
      ? Math.max(0, stamina - STAMINA_DRAIN * dt)
      : Math.min(1, stamina + STAMINA_REGEN * dt);

    if (moving) {
      // Keyboard diagonals and full joystick push both give speed 1; light joystick push walks slower.
      const strength = Math.min(1, mag);
      fx /= mag; fz /= mag;
      // forward f = (-sin, -cos), right r = (cos, -sin)
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const mx = fz * -sin + fx * cos;
      const mz = fz * -cos - fx * sin;
      const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * speedMul * strength;

      // Move one axis at a time so the player slides along walls.
      const nx = object.position.x + mx * speed * dt;
      if (!blocked(nx, object.position.z)) object.position.x = nx;
      const nz = object.position.z + mz * speed * dt;
      if (!blocked(object.position.x, nz)) object.position.z = nz;

      const lim = WORLD_HALF_SIZE - RADIUS;
      object.position.x = THREE.MathUtils.clamp(object.position.x, -lim, lim);
      object.position.z = THREE.MathUtils.clamp(object.position.z, -lim, lim);

      // Turn smoothly to face the movement direction.
      const targetRot = Math.atan2(mx, mz);
      let diff = targetRot - object.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      object.rotation.y += diff * Math.min(1, dt * 12);
      bob += dt * (sprinting ? 16 : 10);
    } else {
      bob = 0;
    }
    object.userData.body.position.y = 1.1 + Math.abs(Math.sin(bob)) * 0.15;
    anim = !moving ? 'idle' : sprinting ? 'run' : 'walk';

    // Third-person camera behind the player along camYaw.
    camTarget.set(
      object.position.x + Math.sin(camYaw) * CAM_DISTANCE,
      object.position.y + CAM_HEIGHT,
      object.position.z + Math.cos(camYaw) * CAM_DISTANCE
    );
    camera.position.lerp(camTarget, Math.min(1, dt * 8));
    camera.lookAt(object.position.x, object.position.y + 1.5, object.position.z);
  }

  return {
    object,
    update,
    getState: () => ({
      x: object.position.x, y: 0, z: object.position.z,
      rotY: object.rotation.y, anim, stamina, sprinting,
    }),
    getCameraYaw: () => camYaw,
    setPosition(x, z, faceCenter = false) {
      object.position.set(x, 0, z);
      if (faceCenter) {
        camYaw = Math.PI;
        object.rotation.y = 0;
        camera.position.set(x, CAM_HEIGHT, z - CAM_DISTANCE);
      }
    },
    setSpeedMultiplier(m) { speedMul = m || 1; },
    setEnabled(v) { enabled = v; if (!v) keys.clear(); },
    setColor(hex) { object.userData.body.material.color.set(hex); },
  };
}
