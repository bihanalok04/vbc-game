// OWNER: Pranjal (game loop, menus, HUD, networking glue).
// Ties everything together: menu -> (solo | multiplayer lobby) -> countdown ->
// round (move, find pandals, events, day/night, sound) -> results.
import * as THREE from 'three';
import { SERVER_URL } from './config.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { createRemotePlayers } from './remotePlayers.js';
import { setupTouchControls } from './touch.js';
import { PandalAudio } from './audio.js';
import { buildCityLife } from './cityLife.js';

// ---------- renderer, scene, lights ----------
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

const mapData = await loadMap();
const world = buildWorld(scene, mapData);
const life = buildCityLife(scene, world); // food stalls + 8 Bengali characters
const player = createPlayer(scene, camera, world, canvas);
const others = createRemotePlayers(scene);
const touch = setupTouchControls();
player.setAutoCamera?.(touch.isTouch); // on phones the camera follows the joystick
const stallCooldown = new Map(); // stall id -> time you can eat there again
const audio = new PandalAudio();
player.setEnabled(false);

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const screens = ['menu', 'lobby', 'results'];
function showScreen(name) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== name);
  const inGame = name === null;
  $('hud').classList.toggle('hidden', !inGame);
  if (inGame) touch.show(); else touch.hide();
}
function toast(text, big = false) {
  const el = document.createElement('div');
  el.className = `toast${big ? ' big' : ''}`;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2700);
}
const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- game state ----------
const state = {
  myId: null,
  room: null,
  phase: 'menu', // menu | lobby | countdown | playing | ended
  endsAt: 0,
  clockOffset: 0, // server time - my time
  discovered: new Set(),
  pending: new Set(),
  score: 0,
  targetLight: 1,
  light: 1,
  spotlight: null, // { x, z, name } during the "Para Gossip" event
  durationSec: 150,
};
const pandalById = new Map((mapData.pandals || []).map((p) => [p.id, p]));

// Remember the player's name between visits (ignore if storage is blocked).
try { $('name').value = localStorage.getItem('pd-name') || ''; } catch {}
const playerName = () => {
  const n = $('name').value.trim() || `Player${Math.floor(Math.random() * 90 + 10)}`;
  try { localStorage.setItem('pd-name', n); } catch {}
  return n;
};

// ---------- network ----------
// The Socket.IO client is served by our own game server (no third-party CDN).
const { io } = await import(`${SERVER_URL}/socket.io/socket.io.esm.min.js`);
const socket = io(SERVER_URL || undefined, { transports: ['websocket', 'polling'] });
window.__pd = { state, player, socket, world }; // handy for debugging in the browser console
socket.on('connect', () => { state.myId = socket.id; $('menu-status').textContent = ''; });
socket.on('connect_error', () => { $('menu-status').textContent = 'Connecting to the game server…'; });
socket.on('disconnect', () => {
  if (state.phase !== 'menu') {
    state.phase = 'menu';
    player.setEnabled(false);
    others.clear();
    showScreen('menu');
    $('menu-status').textContent = 'Lost connection to the server. Try again.';
  }
});

function startAudio() {
  audio.start().catch(() => {}); // must run inside a click/tap
}

// ---------- menu ----------
function pickChoice(container, sec) {
  container.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.sec) === sec));
}
$('time-choice').addEventListener('click', (e) => {
  const sec = Number(e.target.dataset.sec);
  if (!sec) return;
  state.durationSec = sec;
  pickChoice($('time-choice'), sec);
});

function createRoom(mode) {
  startAudio();
  $('menu-status').textContent = '';
  socket.emit('room:create', { name: playerName(), mode, durationSec: state.durationSec }, (res) => {
    if (!res?.ok) { $('menu-status').textContent = res?.error || 'Could not create a room.'; return; }
    enterRoom(res.room);
    if (mode === 'solo') socket.emit('game:start', {}, (r) => { if (!r?.ok) $('menu-status').textContent = r?.error; });
  });
}
$('solo-btn').onclick = () => createRoom('solo');
$('create-btn').onclick = () => createRoom('multiplayer');
$('join-btn').onclick = () => {
  startAudio();
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 5) { $('menu-status').textContent = 'Enter the 5-letter room code.'; return; }
  socket.emit('room:join', { code, name: playerName() }, (res) => {
    if (!res?.ok) { $('menu-status').textContent = res?.error || 'Could not join.'; return; }
    enterRoom(res.room);
  });
};
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-btn').click(); });

function enterRoom(room) {
  state.room = room;
  state.phase = room.state === 'lobby' ? 'lobby' : room.state;
  others.sync(room.players, state.myId);
  if (room.mode === 'multiplayer') {
    renderLobby();
    showScreen('lobby');
  }
}

// ---------- lobby ----------
function renderLobby() {
  const room = state.room;
  if (!room) return;
  const isHost = room.hostId === state.myId;
  $('room-code').textContent = room.code;
  $('lobby-players').innerHTML = room.players
    .map((p) => `<li><span><i class="dot" style="background:${p.color}"></i>${escapeHtml(p.name)}${p.id === state.myId ? ' (you)' : ''}</span><span>${p.isHost ? 'host' : ''}</span></li>`)
    .join('');
  pickChoice($('lobby-time'), room.durationSec);
  $('lobby-time').querySelectorAll('button').forEach((b) => (b.disabled = !isHost));
  const enough = room.players.length >= room.minPlayers;
  $('start-btn').classList.toggle('hidden', !isHost);
  $('start-btn').disabled = !enough;
  $('lobby-status').textContent = isHost
    ? (enough ? '' : 'Waiting for at least one more player…')
    : 'Waiting for the host to start…';
}
$('lobby-time').addEventListener('click', (e) => {
  const sec = Number(e.target.dataset.sec);
  if (sec) socket.emit('room:settings', { durationSec: sec });
});
$('start-btn').onclick = () => {
  socket.emit('game:start', {}, (r) => { if (!r?.ok) $('lobby-status').textContent = r?.error; });
};
function leaveRoom() {
  socket.emit('room:leave');
  state.room = null;
  state.phase = 'menu';
  others.clear();
  player.setEnabled(false);
  showScreen('menu');
}
$('leave-btn').onclick = leaveRoom;
$('menu-btn').onclick = leaveRoom;
$('again-btn').onclick = () => {
  socket.emit('room:reset', {}, (r) => {
    if (!r?.ok) { toast(r?.error || 'Only the host can restart.'); return; }
    if (state.room?.mode === 'solo') socket.emit('game:start');
  });
};

socket.on('room:update', (room) => {
  state.room = room;
  others.sync(room.players, state.myId);
  if (room.state === 'lobby' && room.mode === 'multiplayer') {
    state.phase = 'lobby';
    renderLobby();
    showScreen('lobby');
  }
});
socket.on('player:left', ({ id, name }) => {
  others.remove(id);
  if (state.phase === 'playing') toast(`${name} left`);
});

// ---------- round ----------
socket.on('game:countdown', (d) => {
  state.phase = 'countdown';
  state.clockOffset = d.serverTime - Date.now();
  state.endsAt = d.endsAt;
  state.discovered.clear();
  state.pending.clear();
  state.score = 0;
  state.spotlight = null;
  state.targetLight = d.timeOfDay?.light ?? 1;
  $('score').textContent = '0 pts';
  $('clock').textContent = d.timeOfDay?.clock || '';
  $('banner').classList.add('hidden');
  renderBoard(d.players.map((p, i) => ({ rank: i + 1, ...p, score: 0 })));
  for (const [id, entry] of world.pandals) if (entry.beacon) { entry.beacon.userData.found = false; entry.beacon.material.color.setHex(0xffd166); }

  const me = d.players.find((p) => p.id === state.myId);
  if (me) player.setPosition(me.x, me.z);
  player.setSpeedMultiplier(1);
  player.setEnabled(false);
  others.sync(d.players, state.myId);
  for (const p of d.players) if (p.id !== state.myId) others.place(p.id, p.x, p.z);

  audio.setup(d);
  showScreen(null);

  // 3, 2, 1
  const big = $('big-count');
  big.classList.remove('hidden');
  const tick = () => {
    const left = Math.ceil((d.startsAt - (Date.now() + state.clockOffset)) / 1000);
    if (state.phase !== 'countdown') return;
    if (left > 0) {
      if (big.textContent !== String(left)) { big.textContent = left; audio.playSfx('countdown'); }
      setTimeout(tick, 100);
    }
  };
  big.textContent = '';
  tick();
});

socket.on('game:started', () => {
  state.phase = 'playing';
  $('big-count').textContent = 'GO!';
  setTimeout(() => $('big-count').classList.add('hidden'), 700);
  player.setEnabled(true);
  audio.playSfx('go');
});

socket.on('timer:tick', ({ remainingMs, serverTime, timeOfDay }) => {
  state.clockOffset = serverTime - Date.now();
  state.endsAt = serverTime + remainingMs;
  if (timeOfDay) {
    state.targetLight = timeOfDay.light;
    $('clock').textContent = timeOfDay.clock;
    audio.setLight(timeOfDay.light);
  }
});

socket.on('state:snapshot', ({ players }) => others.applySnapshot(players, state.myId));
socket.on('player:correct', ({ x, z }) => player.setPosition(x, z));

socket.on('pandal:discovered', (d) => {
  if (d.playerId === state.myId) {
    state.score = d.totalScore;
    $('score').textContent = `${d.totalScore} pts`;
    world.markDiscovered(d.pandalId);
    audio.playSfx(d.first ? 'first' : 'discover');
    toast(`${d.pandalName} +${d.points}${d.first ? ' · first!' : ''}${d.breakdown.multiplier > 1 ? ' ×2' : ''}`, true);
  } else {
    toast(`${d.playerName} found ${d.pandalName}${d.first ? ' first' : ''}`);
  }
});

socket.on('leaderboard:update', renderBoard);
function renderBoard(rows) {
  $('leaderboard').innerHTML = rows
    .slice(0, 8)
    .map((r) => `<li class="${r.id === state.myId ? 'me' : ''}"><span><i class="dot" style="background:${r.color}"></i>${escapeHtml(r.name)}</span><b>${r.score}</b></li>`)
    .join('');
}

socket.on('event:started', (e) => {
  $('banner-title').textContent = e.name;
  $('banner-text').textContent = e.description;
  $('banner').classList.remove('hidden');
  player.setSpeedMultiplier(e.effects?.speedMultiplier ?? 1);
  audio.onEvent(e.type, true);
  if (e.type === 'ghetto-spotlight' && e.data) {
    state.spotlight = { x: e.data.x, z: e.data.z, name: pandalById.get(e.data.pandalId)?.name || 'Hidden pandal' };
  }
  toast(e.name, true);
});
socket.on('event:ended', (e) => {
  $('banner').classList.add('hidden');
  player.setSpeedMultiplier(1);
  audio.onEvent(e.type, false);
  if (e.type === 'ghetto-spotlight') state.spotlight = null;
});

socket.on('game:ended', ({ leaderboard, winner, reason }) => {
  state.phase = 'ended';
  player.setEnabled(false);
  audio.playSfx('end');
  $('banner').classList.add('hidden');
  $('big-count').classList.add('hidden');
  const solo = state.room?.mode === 'solo';
  const me = leaderboard.find((r) => r.id === state.myId);
  $('winner').textContent = solo
    ? `You scored ${me?.score ?? 0} points!`
    : winner ? `${winner.name} wins!` : 'Round over';
  $('final-board').innerHTML = leaderboard
    .map((r) => `<li><span>${r.rank}. <i class="dot" style="background:${r.color}"></i>${escapeHtml(r.name)}</span><span>${r.score} pts · ${r.found} found</span></li>`)
    .join('') + (reason === 'all-found' ? '<li><span>Every pandal was found!</span></li>' : '');
  const isHost = state.room?.hostId === state.myId;
  $('again-btn').classList.toggle('hidden', !solo && !isHost);
  showScreen('results');
});

// ---------- per-frame game logic ----------
const camDir = new THREE.Vector3();
let lastSend = 0;
let lastCheck = 0;

// Try to discover any pandal we're standing next to (the server double-checks).
function checkDiscoveries() {
  const s = player.getState();
  for (const p of pandalById.values()) {
    if (state.discovered.has(p.id) || state.pending.has(p.id)) continue;
    if (Math.hypot(p.x - s.x, p.z - s.z) > 7) continue;
    state.pending.add(p.id);
    socket.emit('pandal:discover', { pandalId: p.id }, (res) => {
      state.pending.delete(p.id);
      if (res?.ok || /already/i.test(res?.error || '')) state.discovered.add(p.id);
    });
  }
}

// Arrow pointing at the nearest pandal you haven't found (or the gossip target).
function updateCompass(yaw) {
  const s = player.getState();
  let target = state.spotlight;
  if (!target) {
    let best = null;
    for (const p of pandalById.values()) {
      if (state.discovered.has(p.id) || p.type === 'ghetto') continue; // ghetto pandals stay hidden
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (!best || d < best.d) best = { d, x: p.x, z: p.z, name: p.name };
    }
    target = best;
  }
  if (!target) { $('compass-label').textContent = 'Search the lanes for hidden pandals!'; $('compass-arrow').style.opacity = 0; return; }
  const tx = target.x - s.x;
  const tz = target.z - s.z;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const angle = Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz);
  $('compass-arrow').style.opacity = 1;
  $('compass-arrow').style.transform = `rotate(${angle}rad)`;
  $('compass-label').textContent = `${state.spotlight ? '🤫 ' : ''}${target.name} · ${Math.round(Math.hypot(tx, tz))} m`;
}

const staminaFill = $('stamina-fill');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  player.update(dt);
  others.update(dt);
  life.update(dt);

  camera.getWorldDirection(camDir);
  const yaw = Math.atan2(-camDir.x, -camDir.z);
  const s = player.getState();
  audio.update({ x: s.x, y: 0, z: s.z }, yaw, dt);

  // smooth day/night
  state.light += (state.targetLight - state.light) * Math.min(1, dt * 0.8);
  world.setLight(state.light);

  if (state.phase === 'playing') {
    staminaFill.style.width = `${s.stamina * 100}%`;
    staminaFill.style.background = s.surgeLeft > 0 ? '#52d273' : '';
    // Street food: walk up to a stall to eat and get a stamina surge.
    const stall = life.nearestStall(s.x, s.z, 3.4);
    if (stall && (stallCooldown.get(stall.id) || 0) < now) {
      stallCooldown.set(stall.id, now + 25000);
      player.staminaSurge?.(8);
      audio.playSfx('discover');
      toast(`${stall.food}! Stamina surge 💪`, true);
    }
    const left = state.endsAt - (Date.now() + state.clockOffset);
    $('timer').textContent = fmtTime(left);
    $('timer').classList.toggle('low', left < 20000);
    if (now - lastSend > 100) {
      lastSend = now;
      socket.volatile.emit('player:move', { x: s.x, y: s.y, z: s.z, rotY: s.rotY, anim: s.anim });
    }
    if (now - lastCheck > 250) {
      lastCheck = now;
      checkDiscoveries();
      updateCompass(yaw);
    }
  }
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

showScreen('menu');
