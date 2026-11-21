// Other players: coloured avatars with name tags, smoothed between server snapshots.
import * as THREE from 'three';
import { makeAvatar } from './player.js';

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.roundRect(8, 8, 240, 48, 14); g.fill();
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color || '#fff';
  g.fillText(text.slice(0, 14), 128, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sprite.scale.set(3, 0.75, 1);
  sprite.position.y = 3.2;
  return sprite;
}

export function createRemotes(scene) {
  const others = new Map(); // id -> { obj, target: {x,z,rotY} }

  function ensure(p) {
    let o = others.get(p.id);
    if (!o) {
      const obj = makeAvatar(p.color || 0x66ccff);
      obj.add(nameTag(p.name || 'Player', p.color));
      obj.position.set(p.x || 0, 0, p.z || 0);
      scene.add(obj);
      o = { obj, target: { x: p.x || 0, z: p.z || 0, rotY: p.rotY || 0 }, name: p.name };
      others.set(p.id, o);
    }
    return o;
  }

  return {
    // Info (name, colour) from room:update / game:countdown.
    sync(players, selfId) {
      const keep = new Set();
      for (const p of players) {
        if (p.id === selfId) continue;
        keep.add(p.id);
        const o = ensure(p);
        if (p.x !== undefined) { o.target.x = p.x; o.target.z = p.z; o.obj.position.set(p.x, 0, p.z); }
      }
      for (const id of [...others.keys()]) if (!keep.has(id)) this.remove(id);
    },
    snapshot(players, selfId) {
      for (const p of players) {
        if (p.id === selfId) continue;
        const o = others.get(p.id);
        if (!o) continue;
        o.target = { x: p.x, z: p.z, rotY: p.rotY };
        o.anim = p.anim;
      }
    },
    remove(id) {
      const o = others.get(id);
      if (!o) return;
      scene.remove(o.obj);
      others.delete(id);
    },
    clear() { for (const id of [...others.keys()]) this.remove(id); },
    update(dt) {
      const k = Math.min(1, dt * 12);
      for (const o of others.values()) {
        o.obj.position.x += (o.target.x - o.obj.position.x) * k;
        o.obj.position.z += (o.target.z - o.obj.position.z) * k;
        let d = o.target.rotY - o.obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        o.obj.rotation.y += d * k;
        const moving = o.anim === 'walk' || o.anim === 'run';
        o.bob = moving ? (o.bob || 0) + dt * (o.anim === 'run' ? 16 : 10) : 0;
        o.obj.userData.body.position.y = 1.1 + Math.abs(Math.sin(o.bob)) * 0.15;
      }
    },
  };
}
