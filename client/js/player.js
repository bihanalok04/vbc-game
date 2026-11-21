// OWNER: Bihan (movement, third-person camera, sprint, stamina, controls).
// Phone joystick lives in touch.js (it presses the same W/A/S/D/Shift keys).
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
  let surgeLeft = 0; // seconds of free sprinting after eating at a food stall
  let vy = 0; // vertical speed for jumping
  let height = 0; // how high off the ground
  let autoCamera = false; // phones: camera swings round to follow the joystick direction
  const JUMP_SPEED = 7;
  const GRAVITY = 20;

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
    }
    let mag = Math.hypot(fx, fz);
    const moving = mag > 0.15;

    const wantSprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (stamina <= 0) exhausted = true;
    if (exhausted && stamina >= STAMINA_MIN_RESTART) exhausted = false;
    sprinting = moving && wantSprint && !exhausted;
    if (surgeLeft > 0) {
      // Food surge: stamina stays full while it lasts.
      surgeLeft = Math.max(0, surgeLeft - dt);
      stamina = 1;
      exhausted = false;
    } else {
      stamina = sprinting
        ? Math.max(0, stamina - STAMINA_DRAIN * dt)
        : Math.min(1, stamina + STAMINA_REGEN * dt);
    }

    if (moving) {
      // Normalise so diagonals are not faster.
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

      // Phone joystick: swing the camera round behind wherever the player is heading
      // (not when walking backwards, or the camera would spin).
      if (autoCamera && fz > -0.5) {
        const camTargetYaw = Math.atan2(-mx, -mz);
        let cd = camTargetYaw - camYaw;
        cd = Math.atan2(Math.sin(cd), Math.cos(cd));
        camYaw += cd * Math.min(1, dt * 2.2);
      }
      bob += dt * (sprinting ? 16 : 10);
    } else {
      bob = 0;
    }
    // Jump (Space or the jump button) with simple gravity.
    if (enabled && (keys.has('Space')) && height === 0) vy = JUMP_SPEED;
    if (height > 0 || vy > 0) {
      vy -= GRAVITY * dt;
      height = Math.max(0, height + vy * dt);
      if (height === 0) vy = 0;
    }
    object.position.y = height;

    object.userData.body.position.y = 1.1 + (height > 0 ? 0 : Math.abs(Math.sin(bob)) * 0.15);
    anim = height > 0 ? 'jump' : !moving ? 'idle' : sprinting ? 'run' : 'walk';

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
      rotY: object.rotation.y, anim, stamina, sprinting, surgeLeft,
    }),
    // Eating at a food stall: stamina refills and stays full for `seconds`.
    setAutoCamera(v) { autoCamera = v; },
    staminaSurge(seconds = 8) { surgeLeft = Math.max(surgeLeft, seconds); stamina = 1; exhausted = false; },
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
