// OWNER: Susmit (city, roads, buildings, pandals).
// Placeholder so the game runs. Replace the inside of buildWorld, but KEEP its
// signature and the shape of the object it returns.
//
// buildWorld(scene, data)
//   data = { pandals: [{id,name,type,x,z}], roads: [{x1,z1,x2,z2}], crowdZones: [...] }
//   (comes from the server: GET /api/sound-map; may be empty if the server is down)
// returns {
//   colliders: [{ minX, maxX, minZ, maxZ }],  // every building/wall the player can't walk through
//   setLight(light),                          // 1 = day, 0.15 = night (from timer:tick)
// }
import * as THREE from 'three';
import { WORLD_HALF_SIZE } from './config.js';

export function buildWorld(scene, data = {}) {
  const size = WORLD_HALF_SIZE * 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x4a5a3a })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  for (const r of data.roads || []) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(8, len), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -Math.atan2(r.x2 - r.x1, r.z2 - r.z1);
    road.position.set((r.x1 + r.x2) / 2, 0.02, (r.z1 + r.z2) / 2);
    scene.add(road);
  }

  for (const p of data.pandals || []) {
    const color = p.type === 'ghetto' ? 0xff3366 : 0xffaa00;
    const pandal = new THREE.Mesh(
      new THREE.ConeGeometry(p.type === 'ghetto' ? 2 : 4, 6, 6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
    );
    pandal.position.set(p.x, 3, p.z);
    scene.add(pandal);
  }

  // Test building so collisions can be checked.
  const colliders = [];
  const b = { minX: 10, maxX: 20, minZ: 10, maxZ: 20 };
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), new THREE.MeshStandardMaterial({ color: 0x996655 }));
  box.position.set(15, 4, 15);
  scene.add(box);
  colliders.push(b);

  return { colliders, setLight() {} };
}
