// The other players in the room: a coloured avatar with a name tag each,
// moved smoothly toward the positions in the server's state:snapshot messages.
import * as THREE from 'three';

function nameTag(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.roundRect(8, 8, 240, 48, 24);
  g.fill();
  g.fillStyle = color;
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 33, 220);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(3.2, 0.8, 1);
  sprite.position.y = 2.9;
  sprite.renderOrder = 10;
  return sprite;
}

export function createRemotePlayers(scene) {
  const avatars = new Map(); // id -> { group, target }

  function add(p) {
    if (avatars.has(p.id)) return;
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: p.color || '#ff66aa' });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.0, 4, 8), mat);
    body.position.y = 1.1;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    nose.position.set(0, 1.5, 0.6);
    group.add(body, nose, nameTag(p.name || 'Player', p.color || '#ffffff'));
    group.position.set(p.x || 0, 0, p.z || 0);
    scene.add(group);
    avatars.set(p.id, { group, target: { x: p.x || 0, z: p.z || 0, rotY: 0 } });
  }

  function remove(id) {
    const a = avatars.get(id);
    if (!a) return;
    scene.remove(a.group);
    avatars.delete(id);
  }

  // Keep avatars in line with the room's player list (excluding me).
  function sync(players, myId) {
    const ids = new Set(players.filter((p) => p.id !== myId).map((p) => p.id));
    for (const id of [...avatars.keys()]) if (!ids.has(id)) remove(id);
    for (const p of players) if (p.id !== myId) add(p);
  }

  function applySnapshot(players, myId) {
    for (const p of players) {
      if (p.id === myId) continue;
      const a = avatars.get(p.id);
      if (a) Object.assign(a.target, { x: p.x, z: p.z, rotY: p.rotY });
    }
  }

  function place(id, x, z) {
    const a = avatars.get(id);
    if (!a) return;
    a.group.position.set(x, 0, z);
    Object.assign(a.target, { x, z });
  }

  function update(dt) {
    const k = Math.min(1, dt * 10);
    for (const { group, target } of avatars.values()) {
      group.position.x += (target.x - group.position.x) * k;
      group.position.z += (target.z - group.position.z) * k;
      let diff = target.rotY - group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      group.rotation.y += diff * k;
    }
  }

  function clear() {
    for (const id of [...avatars.keys()]) remove(id);
  }

  return { sync, applySnapshot, place, update, remove, clear };
}
