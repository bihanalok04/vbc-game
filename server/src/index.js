const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const { PANDALS } = require('./pandals');
const { EVENT_TYPES } = require('./events');
const { SOUND_MAP } = require('./soundMap');
const RoomManager = require('./RoomManager');

// ---------- HTTP (Express) ----------

const origins =
  config.CLIENT_ORIGIN === '*' ? '*' : config.CLIENT_ORIGIN.split(',').map((s) => s.trim());

const app = express();
app.use(cors({ origin: origins }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Numbers the frontend needs so it stays in sync with the server.
app.get('/api/config', (req, res) => {
  res.json({
    modes: config.MODES,
    durationOptionsSec: config.ROUND_DURATION_OPTIONS_SEC,
    defaultDurationSec: config.DEFAULT_ROUND_DURATION_SEC,
    dayCycle: config.DAY_CYCLE,
    countdownMs: config.COUNTDOWN_MS,
    points: config.POINTS,
    discoveryRadius: config.DISCOVERY_RADIUS,
    walkSpeed: config.WALK_SPEED,
    sprintSpeed: config.SPRINT_SPEED,
    worldHalfSize: config.WORLD_HALF_SIZE,
    events: EVENT_TYPES.map(({ type, name, description, durationMs, effects }) => ({
      type, name, description, durationMs, effects,
    })),
  });
});

app.get('/api/pandals', (req, res) => res.json(PANDALS));
app.get('/api/sound-map', (req, res) => res.json({ pandals: PANDALS, ...SOUND_MAP }));

let rooms; // set below, once Socket.IO exists
app.get('/api/rooms', (req, res) => res.json(rooms.list()));

// For local development, also serve the frontend if a client/ folder exists,
// so one `npm run dev` gives you the whole game at http://localhost:3000.
// In production the frontend is hosted on Vercel instead.
const clientDir = path.join(__dirname, '..', '..', 'client');
if (fs.existsSync(clientDir)) app.use(express.static(clientDir));

// ---------- Real-time (Socket.IO) ----------

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: origins } });
rooms = new RoomManager(io);

function cleanName(name) {
  const cleaned = String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, config.MAX_NAME_LENGTH);
  return cleaned || 'Player';
}

// Every event that takes a reply uses a Socket.IO acknowledgement callback.
// This wrapper makes sure a missing callback never crashes the server.
function reply(cb, payload) {
  if (typeof cb === 'function') cb(payload);
}

io.on('connection', (socket) => {
  // data: { name, mode: 'solo' | 'multiplayer', durationSec: 120 | 150 | 180 }
  // Solo: create, then send game:start straight away.
  socket.on('room:create', (data, cb) => {
    const room = rooms.createRoom({ mode: data?.mode, durationSec: data?.durationSec });
    const player = rooms.join(socket, room, cleanName(data?.name));
    reply(cb, { ok: true, playerId: player.id, room: room.publicState() });
  });

  socket.on('room:join', (data, cb) => {
    const room = rooms.getRoom(data?.code);
    if (!room) return reply(cb, { ok: false, error: 'Room not found. Check the code.' });
    if (room.mode === 'solo') return reply(cb, { ok: false, error: 'That is a single-player game.' });
    if (room.isFull()) return reply(cb, { ok: false, error: 'Room is full.' });
    if (room.state !== 'lobby') return reply(cb, { ok: false, error: 'That game has already started.' });
    const player = rooms.join(socket, room, cleanName(data?.name));
    reply(cb, { ok: true, playerId: player.id, room: room.publicState() });
  });

  socket.on('room:leave', (_data, cb) => {
    rooms.leave(socket.id);
    reply(cb, { ok: true });
  });

  socket.on('game:start', (_data, cb) => {
    const room = rooms.roomOf(socket.id);
    if (!room) return reply(cb, { ok: false, error: 'You are not in a room.' });
    reply(cb, room.startGame(socket.id));
  });

  // Host picks the round length in the lobby: { durationSec: 120 | 150 | 180 }
  socket.on('room:settings', (data, cb) => {
    const room = rooms.roomOf(socket.id);
    if (!room) return reply(cb, { ok: false, error: 'You are not in a room.' });
    reply(cb, room.updateSettings(socket.id, data || {}));
  });

  socket.on('room:reset', (_data, cb) => {
    const room = rooms.roomOf(socket.id);
    if (!room) return reply(cb, { ok: false, error: 'You are not in a room.' });
    reply(cb, room.resetToLobby(socket.id));
  });

  // Sent by the client ~10-20 times a second while playing. No reply.
  socket.on('player:move', (data) => {
    rooms.roomOf(socket.id)?.handleMove(socket, data);
  });

  socket.on('pandal:discover', (data, cb) => {
    const room = rooms.roomOf(socket.id);
    if (!room) return reply(cb, { ok: false, error: 'You are not in a room.' });
    reply(cb, room.handleDiscover(socket.id, data?.pandalId));
  });

  // Lets clients measure lag and line up their timer with the server's clock.
  socket.on('ping:check', (_data, cb) => reply(cb, { serverTime: Date.now() }));

  socket.on('disconnect', () => rooms.leave(socket.id));
});

server.listen(config.PORT, () => {
  console.log(`Pandal Dash server running on http://localhost:${config.PORT}`);
});

module.exports = { app, server, io };
