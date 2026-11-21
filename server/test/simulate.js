// End-to-end check: starts the server, connects two fake players, plays a
// short round and checks rooms, movement, discovery and scoring all work.
// Run with:  npm test

process.env.PORT = process.env.PORT || '3999';
const { server } = require('../src/index');
const { io: connect } = require('socket.io-client');
const { getPandal } = require('../src/pandals');

const URL = `http://localhost:${process.env.PORT}`;
let failures = 0;

function check(label, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (socket, event, data) => new Promise((r) => socket.emit(event, data, r));
const once = (socket, event) => new Promise((r) => socket.once(event, r));

// Walk to (tx, tz) at a legal speed by sending small steps, like a real client.
async function walkTo(socket, pos, tx, tz) {
  const step = 1.2; // units per 100 ms = 12 units/s, a normal sprint
  while (Math.hypot(tx - pos.x, tz - pos.z) > 0.5) {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const d = Math.hypot(dx, dz);
    const s = Math.min(step, d);
    pos.x += (dx / d) * s;
    pos.z += (dz / d) * s;
    socket.emit('player:move', { x: pos.x, y: 0, z: pos.z, rotY: 0, anim: 'run' });
    await wait(100);
  }
}

async function main() {
  const a = connect(URL, { transports: ['websocket'] });
  const b = connect(URL, { transports: ['websocket'] });
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);

  // Rooms
  const created = await emit(a, 'room:create', { name: 'Riya' });
  check('host creates a room', created.ok && created.room.code.length === 5, created.room?.code);
  const code = created.room.code;

  // Solo: a single player can play a round on their own.
  const solo = connect(URL, { transports: ['websocket'] });
  await once(solo, 'connect');
  const soloRoom = await emit(solo, 'room:create', { name: 'Solo' });
  const soloStarted = once(solo, 'game:countdown');
  const soloStart = await emit(solo, 'game:start');
  const soloCd = await soloStarted;
  check('solo player can start a round', soloRoom.ok && soloStart.ok);
  check('round lasts 150 seconds', soloCd.durationMs === 150 * 1000);
  solo.disconnect();

  const bad = await emit(b, 'room:join', { code: 'ZZZZZ', name: 'Arjun' });
  check('joining a wrong code fails', !bad.ok);

  const joined = await emit(b, 'room:join', { code: code.toLowerCase(), name: 'Arjun' });
  check('second player joins (code is case-insensitive)', joined.ok && joined.room.players.length === 2);

  const notHost = await emit(b, 'game:start');
  check('only the host can start', !notHost.ok);

  // Start the round
  const countdown = once(a, 'game:countdown');
  const started = once(a, 'game:started');
  const start = await emit(a, 'game:start');
  check('host starts the game', start.ok);
  const cd = await countdown;
  check('countdown sends the pandal list', cd.pandals.length > 0, `${cd.pandals.length} pandals`);
  await started;
  check('round starts after the countdown', true);

  const posA = { ...cd.players.find((p) => p.id === a.id) };
  const posB = { ...cd.players.find((p) => p.id === b.id) };

  // Snapshots
  const snap = await once(b, 'state:snapshot');
  check('players receive position snapshots', snap.players.length === 2);

  // Discovery too far away
  const far = await emit(a, 'pandal:discover', { pandalId: 'chhoto-para' });
  check('cannot discover a pandal from far away', !far.ok, far.error);

  // Teleport attempt
  const corrected = once(a, 'player:correct');
  a.emit('player:move', { x: 100, y: 0, z: 100 });
  await corrected;
  check('teleporting is rejected and corrected', true);

  // Walk to a ghetto pandal and discover it first (+5 +2 = 7, maybe doubled by an event)
  const ghetto = getPandal('chhoto-para');
  await walkTo(a, posA, ghetto.x, ghetto.z);
  const discovered = once(b, 'pandal:discovered');
  const first = await emit(a, 'pandal:discover', { pandalId: ghetto.id });
  check('first discovery of a ghetto pandal = 7 points', first.ok && first.points === 7 && first.first, JSON.stringify(first));
  const seen = await discovered;
  check('other players are told about the discovery', seen.playerName === 'Riya');

  const again = await emit(a, 'pandal:discover', { pandalId: ghetto.id });
  check('cannot discover the same pandal twice', !again.ok);

  // Second player reaches the same pandal: no first-discovery bonus
  const board = once(a, 'leaderboard:update');
  await walkTo(b, posB, ghetto.x, ghetto.z);
  const second = await emit(b, 'pandal:discover', { pandalId: ghetto.id });
  check('second discoverer gets 5 points, no bonus', second.ok && second.points === 5 && !second.first);
  const lb = await board;
  check('leaderboard ranks Riya first', lb[0].name === 'Riya' && lb[0].score === 7 && lb[1].score === 5);

  // A player leaving mid-round does not end it for the others.
  const left = once(a, 'player:left');
  b.disconnect();
  await left;
  const stillOn = await emit(a, 'pandal:discover', { pandalId: 'bagbazar' });
  check('round keeps going after a player leaves', stillOn.error === 'Too far away. Get closer to the pandal.');

  a.disconnect();
  await wait(100);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(() => {
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
    server.close();
    process.exit(failures ? 1 : 0);
  });
