// Thin wrapper around the Socket.IO connection. io() is loaded by /socket.io/socket.io.js.
import { SERVER_URL } from './config.js';

const socket = window.io(SERVER_URL || undefined, { transports: ['websocket', 'polling'] });

// Server clock offset so every device shows the same timer.
let clockOffset = 0;
export function serverNow() {
  return Date.now() + clockOffset;
}
function syncClock() {
  const sent = Date.now();
  socket.emit('ping:check', {}, ({ serverTime }) => {
    const rtt = Date.now() - sent;
    clockOffset = serverTime + rtt / 2 - Date.now();
  });
}
socket.on('connect', syncClock);

function ask(event, data = {}) {
  return new Promise((resolve) => {
    if (!socket.connected) {
      // Render free tier may be waking up; wait for the connection.
      const t = setTimeout(() => resolve({ ok: false, error: 'Server is waking up. Try again in a few seconds.' }), 15000);
      socket.once('connect', () => { clearTimeout(t); socket.emit(event, data, resolve); });
      return;
    }
    socket.emit(event, data, resolve);
  });
}

export const net = {
  socket,
  get id() { return socket.id; },
  on: (event, fn) => socket.on(event, fn),
  createRoom: (name, mode, durationSec) => ask('room:create', { name, mode, durationSec }),
  joinRoom: (code, name) => ask('room:join', { code: code.trim().toUpperCase(), name }),
  leaveRoom: () => ask('room:leave'),
  setDuration: (durationSec) => ask('room:settings', { durationSec }),
  start: () => ask('game:start'),
  reset: () => ask('room:reset'),
  discover: (pandalId) => ask('pandal:discover', { pandalId }),
  sendMove: (s) => socket.volatile.emit('player:move', { x: s.x, y: s.y, z: s.z, rotY: s.rotY, anim: s.anim }),
};
