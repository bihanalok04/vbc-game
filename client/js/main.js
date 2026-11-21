// OWNER: Pranjal (game loop, menus, HUD, networking glue).
import * as THREE from 'three';
import { SERVER_URL } from './config.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a8d0);
scene.fog = new THREE.Fog(0x87a8d0, 60, 220);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444422, 1.2));
const sun = new THREE.DirectionalLight(0xffeecc, 1.5);
sun.position.set(50, 100, 30);
scene.add(sun);

async function loadMap() {
  try {
    const res = await fetch(`${SERVER_URL}/api/sound-map`);
    return await res.json();
  } catch {
    return {}; // server not reachable yet: build an empty city
  }
}

const world = buildWorld(scene, await loadMap());
const player = createPlayer(scene, camera, world, canvas);

const staminaFill = document.getElementById('stamina-fill');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  player.update(dt);
  staminaFill.style.width = `${player.getState().stamina * 100}%`;
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
