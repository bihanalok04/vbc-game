// Game flow: menu -> (lobby) -> countdown -> playing -> results.
import * as THREE from 'three';
import { SERVER_URL } from './config.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { createRemotes } from './remotes.js';
import { net, serverNow } from './net.js';
import { PandalAudio } from './audio.js';

const DISCOVER_RANGE = 6.5; // server allows 8; leave slack for the last sent position
const $ = (id) => document.getElementById(id);

// ---------- 3D setup ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2 });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
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
    return {};
  }
}

const world = buildWorld(scene, await loadMap());
const player = createPlayer(scene, camera, world, canvas);
const remotes = createRemotes(scene);
const audio = new PandalAudio();
player.setPosition(0, 0, true);
window.__pd = { player, world };

// ---------- game state ----------
let phase = 'menu'; // menu | lobby | countdown | playing | results
let room = null;
let mode = 'solo';
let duration = 150;
let pandals = [];
let endsAt = 0;
let startsAt = 0;
const found = new Set();
const pending = new Map(); // pandalId -> time of last attempt
let revealed = null; // ghetto pandal revealed by an event
let moveTimer = null;
let myScore = 0;
const beaconColors = new Map();

// ---------- screens ----------
function show(screen) {
  phase = screen;
  for (const id of ['menu', 'lobby', 'results']) $(id).classList.toggle('hidden', id !== screen);
  const inGame = screen === 'countdown' || screen === 'playing';
  $('hud').classList.toggle('hidden', !inGame);
  document.body.classList.toggle('playing', screen === 'playing');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const NAMES = ['Dhaki', 'Rasgulla', 'Phuchka', 'Kumor', 'Shankh', 'Alpana', 'Dhunuchi', 'Mishti', 'Tram', 'Hilsa'];
function savedName() {
  try { return localStorage.getItem('pd-name') || ''; } catch { return ''; }
}
$('name').value = savedName() || `${NAMES[Math.floor(Math.random() * NAMES.length)]}${Math.floor(Math.random() * 90 + 10)}`;
function myName() {
  const n = $('name').value.trim() || 'Player';
  try { localStorage.setItem('pd-name', n); } catch { /* private mode */ }
  return n;
}

function bindChips(containerId, onPick) {
  $(containerId).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (!b || b.disabled) return;
    onPick(Number(b.dataset.d));
  });
}
function markChips(containerId, d) {
  for (const b of $(containerId).querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.d) === d);
}
bindChips('dur-menu', (d) => { duration = d; markChips('dur-menu', d); });
bindChips('dur-lobby', async (d) => {
  const res = await net.setDuration(d);
  if (!res.ok) $('lobby-msg').textContent = res.error;
});

function busy(on) {
  for (const id of ['btn-solo', 'btn-create', 'btn-join', 'btn-start', 'btn-again']) $(id).disabled = on;
}

// ---------- menu actions ----------
$('btn-solo').onclick = async () => {
  audio.start();
  await playSolo();
};

async function playSolo() {
  busy(true);
  $('menu-msg').textContent = net.socket.connected ? '' : 'Connecting to server…';
  mode = 'solo';
  const res = await net.createRoom(myName(), 'solo', duration);
  if (!res.ok) { busy(false); $('menu-msg').textContent = res.error; show('menu'); return; }
  room = res.room;
  const start = await net.start();
  busy(false);
  if (!start.ok) { $('menu-msg').textContent = start.error; show('menu'); }
}

$('btn-create').onclick = async () => {
  audio.start();
  busy(true);
  mode = 'multiplayer';
  const res = await net.createRoom(myName(), 'multiplayer', duration);
  busy(false);
  if (!res.ok) { $('menu-msg').textContent = res.error; return; }
  room = res.room;
  renderLobby();
  show('lobby');
};

$('btn-join').onclick = async () => {
  const code = $('code').value.trim();
  if (code.length < 4) { $('menu-msg').textContent = 'Type the room code first.'; return; }
  audio.start();
  busy(true);
  mode = 'multiplayer';
  const res = await net.joinRoom(code, myName());
  busy(false);
  if (!res.ok) { $('menu-msg').textContent = res.error; return; }
  room = res.room;
  renderLobby();
  show('lobby');
};
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

$('btn-start').onclick = async () => {
  busy(true);
  const res = await net.start();
  busy(false);
  if (!res.ok) $('lobby-msg').textContent = res.error;
};

$('btn-leave').onclick = async () => {
  await net.leaveRoom();
  room = null;
  remotes.clear();
  show('menu');
};

$('btn-again').onclick = async () => {
  $('results-msg').textContent = '';
  if (mode === 'solo') {
    await net.leaveRoom();
    await playSolo();
    return;
  }
  const res = await net.reset();
  if (!res.ok) $('results-msg').textContent = res.error;
};

$('btn-menu').onclick = async () => {
  await net.leaveRoom();
  room = null;
  remotes.clear();
  show('menu');
};

function isHost() {
  return room && room.hostId === net.id;
}

function renderLobby() {
  if (!room) return;
  $('lobby-code').textContent = room.code;
  $('lobby-players').innerHTML = room.players
    .map((p) => `<li class="${p.id === net.id ? 'me' : ''}"><span class="dot" style="background:${esc(p.color)}"></span>
      <span class="grow">${esc(p.name)}</span>${p.isHost ? '<small>host</small>' : ''}</li>`)
    .join('');
  markChips('dur-lobby', room.durationSec);
  const host = isHost();
  for (const b of $('dur-lobby').querySelectorAll('button')) b.disabled = !host;
  const enough = room.players.length >= (room.minPlayers || 2);
  $('btn-start').classList.toggle('hidden', !host);
  $('btn-start').disabled = !enough;
  $('lobby-msg').textContent = host
    ? (enough ? '' : 'Waiting for at least one friend to join…')
    : 'Waiting for the host to start…';
}

// ---------- server events ----------
net.on('room:update', (r) => {
  room = r;
  if (mode !== 'multiplayer') return;
  if (r.state === 'lobby' && (phase === 'lobby' || phase === 'results')) {
    renderLobby();
    show('lobby');
  }
});

net.on('player:left', ({ id }) => remotes.remove(id));

net.on('game:countdown', (d) => {
  pandals = d.pandals || [];
  startsAt = d.startsAt;
  endsAt = d.endsAt;
  found.clear();
  pending.clear();
  revealed = null;
  myScore = 0;
  resetBeacons();
  updateScore(0);
  $('board').innerHTML = '';
  $('toasts').innerHTML = '';
  $('banner').classList.add('hidden');
  player.setSpeedMultiplier(1);

  const me = (d.players || []).find((p) => p.id === net.id);
  if (me) {
    player.setPosition(me.x, me.z, true);
    if (me.color) player.setColor(me.color);
  }
  remotes.sync(d.players || [], net.id);
  world.setLight(d.timeOfDay?.light ?? 1);
  audio.setup(d);
  audio.setLight(d.timeOfDay?.light ?? 1);
  player.setEnabled(false);
  show('countdown');
  $('countdown').classList.remove('hidden');
});

net.on('game:started', (d) => {
  endsAt = d.endsAt;
  $('countdown').classList.add('hidden');
  player.setEnabled(true);
  audio.playSfx('go');
  show('playing');
  clearInterval(moveTimer);
  moveTimer = setInterval(() => net.sendMove(player.getState()), 100);
});

net.on('timer:tick', ({ timeOfDay }) => {
  if (!timeOfDay) return;
  world.setLight(timeOfDay.light);
  audio.setLight(timeOfDay.light);
  $('clock').textContent = timeOfDay.clock || '';
});

net.on('state:snapshot', ({ players }) => remotes.snapshot(players, net.id));

net.on('player:correct', ({ x, z }) => player.setPosition(x, z));

net.on('pandal:discovered', (d) => {
  const mine = d.playerId === net.id;
  if (mine) {
    found.add(d.pandalId);
    world.markDiscovered?.(d.pandalId);
    updateScore(d.totalScore);
    audio.playSfx(d.first ? 'first' : 'discover');
    const kind = d.pandalType === 'ghetto' ? ' · hidden gem!' : '';
    toast(`+${d.points} ${esc(d.pandalName)}${d.first ? ' · FIRST!' : ''}${kind}`, true);
  } else {
    toast(`${esc(d.playerName)} found ${esc(d.pandalName)} +${d.points}`);
  }
});

net.on('leaderboard:update', (list) => {
  $('board').innerHTML = list
    .slice(0, 8)
    .map((p) => `<li class="${p.id === net.id ? 'me' : ''}"><span>${p.rank}</span><span class="dot" style="background:${esc(p.color)}"></span>
      <span class="grow">${esc(p.name)}</span><b>${p.score}</b></li>`)
    .join('');
  const me = list.find((p) => p.id === net.id);
  if (me) updateScore(me.score);
});

net.on('event:started', (e) => {
  $('banner').innerHTML = `${esc(e.name || 'Event!')}<small>${esc(e.description || '')}</small>`;
  $('banner').classList.remove('hidden');
  player.setSpeedMultiplier(e.effects?.speedMultiplier || 1);
  audio.onEvent(e.type, true);
  if (e.data && Number.isFinite(e.data.x)) revealed = e.data.pandalId || pandals.find((p) => p.x === e.data.x && p.z === e.data.z)?.id || null;
});

net.on('event:ended', (e) => {
  $('banner').classList.add('hidden');
  player.setSpeedMultiplier(1);
  audio.onEvent(e.type, false);
  revealed = null;
});

net.on('game:ended', ({ leaderboard, winner }) => {
  clearInterval(moveTimer);
  player.setEnabled(false);
  audio.playSfx('end');
  const board = leaderboard || [];
  const topScore = board[0]?.score ?? 0;
  const tied = board.filter((p) => p.score === topScore).length > 1;
  if (mode === 'solo') {
    $('winner').textContent = `You scored ${myScore} points!`;
  } else if (tied) {
    $('winner').textContent = `It's a tie at ${topScore}!`;
  } else {
    $('winner').textContent = winner?.id === net.id ? '🏆 You win!' : `🏆 ${winner?.name || '—'} wins!`;
  }
  $('final').innerHTML = board
    .map((p) => `<li class="${p.id === net.id ? 'me' : ''}"><b>${p.rank}</b><span class="dot" style="background:${esc(p.color)}"></span>
      <span class="grow">${esc(p.name)}</span><span>${p.found} found · <b>${p.score}</b></span></li>`)
    .join('');
  const canRestart = mode === 'solo' || isHost();
  $('btn-again').classList.toggle('hidden', !canRestart);
  $('results-msg').textContent = canRestart ? '' : 'Waiting for the host to start another round…';
  setTimeout(() => show('results'), 1200);
});

net.socket.on('connect', () => { $('menu-msg').textContent = ''; });
net.socket.on('disconnect', () => {
  if (phase === 'playing' || phase === 'countdown' || phase === 'lobby') {
    clearInterval(moveTimer);
    player.setEnabled(false);
    remotes.clear();
    room = null;
    show('menu');
    $('menu-msg').textContent = 'Lost connection to the server. Try again.';
  }
});

// ---------- HUD helpers ----------
function updateScore(score) {
  myScore = score;
  $('score').innerHTML = `${score} <small>pts</small>`;
  $('found').textContent = `${found.size}/${pandals.length || '?'} found`;
}

function toast(html, mine = false) {
  const el = document.createElement('div');
  el.className = `toast${mine ? ' mine' : ''}`;
  el.innerHTML = html;
  $('toasts').prepend(el);
  setTimeout(() => el.remove(), 2600);
  while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
}

function resetBeacons() {
  if (!world.pandals) return;
  for (const [id, entry] of world.pandals) {
    const b = entry.beacon;
    if (!b) continue;
    if (!beaconColors.has(id)) beaconColors.set(id, b.material.color.getHex());
    b.material.color.setHex(beaconColors.get(id));
    b.userData.found = false;
  }
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Points the compass at the nearest pandal you haven't found (or a revealed one).
function updateCompass() {
  const me = player.getState();
  let best = null;
  let bestD = Infinity;
  for (const p of pandals) {
    if (found.has(p.id)) continue;
    let d = Math.hypot(p.x - me.x, p.z - me.z);
    if (p.id === revealed) d = -1; // always point at the revealed ghetto pandal
    if (d < bestD) { bestD = d; best = p; }
  }
  if (!best) {
    $('arrow').style.visibility = 'hidden';
    $('target').textContent = 'All pandals found!';
    return;
  }
  const dist = Math.hypot(best.x - me.x, best.z - me.z);
  const yaw = player.getCameraYaw();
  const toTarget = Math.atan2(best.x - me.x, best.z - me.z);
  const rel = toTarget - (yaw + Math.PI);
  // Arrow glyph points right; -90deg makes it point up (= camera forward).
  $('arrow').style.visibility = 'visible';
  $('arrow').style.transform = `rotate(${-rel * (180 / Math.PI) - 90}deg)`;
  const label = best.type === 'ghetto' ? (best.id === revealed ? '★ revealed ghetto pandal' : 'hidden pandal') : best.name;
  $('target').textContent = `${label} · ${Math.round(dist)} m`;
}

function tryDiscover() {
  const me = player.getState();
  const now = performance.now();
  for (const p of pandals) {
    if (found.has(p.id)) continue;
    if (Math.hypot(p.x - me.x, p.z - me.z) > DISCOVER_RANGE) continue;
    if (now - (pending.get(p.id) || 0) < 600) continue;
    pending.set(p.id, now);
    net.socket.emit('player:move', { x: me.x, y: me.y, z: me.z, rotY: me.rotY, anim: me.anim });
    net.discover(p.id).then((res) => {
      if (res.ok) found.add(p.id);
      else if (/already/i.test(res.error || '')) found.add(p.id);
    });
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let staminaShown = -1;
renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.1)));
window.__pd.frame = (dt) => frame(dt);

function frame(dt) {
  player.update(dt);
  remotes.update(dt);

  const st = player.getState();
  audio.update(st, player.getCameraYaw(), dt);

  if (phase === 'countdown') {
    const left = startsAt - serverNow();
    $('countdown').textContent = left > 0 ? String(Math.ceil(left / 1000)) : 'GO!';
    $('timer').textContent = fmt(endsAt - startsAt);
  }
  if (phase === 'playing') {
    const left = endsAt - serverNow();
    $('timer').textContent = fmt(left);
    $('timer').classList.toggle('low', left < 10000);
    tryDiscover();
    updateCompass();
  }
  const s = Math.round(st.stamina * 100);
  if (s !== staminaShown) {
    staminaShown = s;
    $('stamina-fill').style.width = `${s}%`;
    $('stamina-fill').classList.toggle('tired', st.stamina < 0.2);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

show('menu');
