// OWNER: Bihan (movement, third-person camera, sprint, stamina, controls).
//
// createPlayer(scene, camera, world, domElement)
// returns {
//   object,                      // THREE.Object3D of the local player
//   update(dt),                  // call every frame
//   getState(),                  // { x, y, z, rotY, anim, stamina, sprinting } -> send x,y,z,rotY,anim to server
//   setPosition(x, z),           // spawn / server correction (player:correct)
//   setSpeedMultiplier(m),       // random events (event:started effects.speedMultiplier)
//   setEnabled(bool),            // freeze during countdown / results
// }
import * as THREE from 'three';
import { WALK_SPEED, SPRINT_SPEED, WORLD_HALF_SIZE } from './config.js';

const RADIUS = 0.6;
const STAMINA_DRAIN = 0.25; // per second while sprinting (4 s of full sprint)
const STAMINA_REGEN = 0.15; // per second while not sprinting
const CAM_DISTANCE = 9;
const CAM_HEIGHT = 4.5;

export function createPlayer(scene, camera, world, domElement) {
  // Body: simple capsule with a "nose" so facing is visible.
  const object = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(RADIUS, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xffcc33 })
  );
  body.position.y = 1.1;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0xcc2222 }));
  nose.position.set(0, 1.5, 0.6);
  object.add(body, nose);
  scene.add(object);

  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // Camera yaw: drag with mouse or finger to look around.
  let camYaw = Math.PI; // camera sits behind the player (player faces +Z)
  let dragging = false;
  let lastX = 0;
  domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    camYaw -= (e.clientX - lastX) * 0.005;
    lastX = e.clientX;
  });

  let stamina = 1;
  let sprinting = false;
  let speedMul = 1;
  let enabled = true;
  let anim = 'idle';

  function blocked(x, z) {
    for (const c of world.colliders) {
      if (x > c.minX - RADIUS && x < c.maxX + RADIUS && z > c.minZ - RADIUS && z < c.maxZ + RADIUS) return true;
    }
    return false;
  }

  const camTarget = new THREE.Vector3();

  function update(dt) {
    // Input -> direction relative to the camera.
    let fx = 0, fz = 0;
    if (enabled) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
    }
    const moving = fx !== 0 || fz !== 0;

    const wantSprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    sprinting = moving && wantSprint && stamina > 0.02;
    stamina = sprinting
      ? Math.max(0, stamina - STAMINA_DRAIN * dt)
      : Math.min(1, stamina + STAMINA_REGEN * dt);

    if (moving) {
      const len = Math.hypot(fx, fz);
      fx /= len; fz /= len;
      // Forward is the direction the camera looks (opposite its offset).
      // forward f = (-sin, -cos), right r = (cos, -sin); fx is +1 for right.
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const mx = fz * -sin + fx * cos;
      const mz = fz * -cos - fx * sin;
      const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * speedMul;

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
    }
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
      x: object.position.x, y: object.position.y, z: object.position.z,
      rotY: object.rotation.y, anim, stamina, sprinting,
    }),
    setPosition(x, z) { object.position.set(x, 0, z); },
    setSpeedMultiplier(m) { speedMul = m; },
    setEnabled(v) { enabled = v; },
  };
}
