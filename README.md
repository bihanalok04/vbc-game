# Pandal Dash — The Great Pandal Hunt

A browser-based multiplayer 3D game inspired by Kolkata's Durga Puja.

```
vbc-game/
├── client/            Frontend (Three.js, HTML, CSS) — Members 1, 2, 4
└── server/            Backend (Node.js, Express, Socket.IO) — Member 3
    ├── src/
    │   ├── index.js        Starts the server, HTTP routes, socket events
    │   ├── config.js       All tuning numbers (timer, points, speeds)
    │   ├── pandals.js      Pandal positions and spawn points
    │   ├── events.js       Random events
    │   ├── Room.js         One game room: players, timer, scoring
    │   └── RoomManager.js  Creates and finds rooms
    └── test/simulate.js    Two fake players play a round to check everything
```

## Run the backend

```
cd server
npm install
npm run dev
```

The server runs at http://localhost:3000. Check http://localhost:3000/health.
If a `client/` folder exists, the server also serves it, so the whole game
works at http://localhost:3000 during development.

Run `npm test` to check that rooms, movement and scoring work.

## How the frontend talks to the backend

Load Socket.IO in the HTML page:

```html
<script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
```

```js
// Local: the same server. Deployed: your Render URL.
const SERVER_URL = location.hostname === 'localhost' ? '' : 'https://YOUR-APP.onrender.com';
const socket = io(SERVER_URL);

// SINGLE PLAYER: create a solo room and start straight away
socket.emit('room:create', { name: 'Riya', mode: 'solo', durationSec: 150 }, () => {
  socket.emit('game:start');
});

// MULTIPLAYER: create a room (host) and share the code
socket.emit('room:create', { name: 'Riya', mode: 'multiplayer', durationSec: 150 }, (res) => {
  if (!res.ok) return alert(res.error);
  console.log('Room code:', res.room.code); // show this so friends can join
});

// Host changes the time limit in the lobby: 120, 150 or 180 seconds
socket.emit('room:settings', { durationSec: 180 });

// Join a room
socket.emit('room:join', { code: 'AB3CD', name: 'Arjun' }, (res) => {
  if (!res.ok) alert(res.error);
});

// Host starts the round (multiplayer needs 2+ players)
socket.emit('game:start', {}, (res) => { if (!res.ok) alert(res.error); });

// Send your position about 10 times a second while playing
setInterval(() => {
  socket.emit('player:move', { x: player.position.x, y: player.position.y, z: player.position.z, rotY: player.rotation.y, anim: 'run' });
}, 100);

// Draw everyone else from the snapshots
socket.on('state:snapshot', ({ players }) => {
  for (const p of players) if (p.id !== socket.id) moveOtherPlayer(p);
});

// When the player is near a pandal, try to discover it
socket.emit('pandal:discover', { pandalId: 'bagbazar' }, (res) => {
  if (res.ok) showToast(`+${res.points}${res.first ? ' (first!)' : ''}`);
});
```

### Messages you send (client → server)

| Event             | Data                              | Reply                                  |
| ----------------- | --------------------------------- | -------------------------------------- |
| `room:create`     | `{ name, mode: 'solo'\|'multiplayer', durationSec: 120\|150\|180 }` | `{ ok, playerId, room }` |
| `room:settings`   | `{ durationSec }` (host, in lobby) | `{ ok, durationSec }` or `{ ok:false, error }` |
| `room:join`       | `{ code, name }`                  | `{ ok, playerId, room }` or `{ ok:false, error }` |
| `room:leave`      | —                                 | `{ ok }`                               |
| `game:start`      | — (host only; multiplayer 2+)     | `{ ok }` or `{ ok:false, error }`      |
| `player:move`     | `{ x, y, z, rotY, anim }`         | none                                   |
| `pandal:discover` | `{ pandalId }`                    | `{ ok, points, first, totalScore }` or `{ ok:false, error }` |
| `room:reset`      | — (host only, after the round)    | `{ ok }`                               |
| `ping:check`      | —                                 | `{ serverTime }`                       |

### Messages you receive (server → client)

| Event               | Data                                                                 | Use it for |
| ------------------- | -------------------------------------------------------------------- | ---------- |
| `room:update`       | `{ code, state, mode, durationSec, durationOptions, hostId, players[], ... }` | Lobby screen, player list, time picker |
| `player:left`       | `{ id, name }`                                                       | Remove their avatar |
| `game:countdown`    | `{ mode, startsAt, endsAt, durationMs, pandals[], soundMap, timeOfDay, players[] }` | Build pandals, place players, start audio, show 3-2-1 |
| `game:started`      | `{ startsAt, endsAt, serverTime }`                                   | Let players move |
| `timer:tick`        | `{ remainingMs, timeOfDay: { hour, light, phase, clock } }` every second | Countdown timer, sky/lighting |
| `state:snapshot`    | `{ t, players: [{ id, x, y, z, rotY, anim }] }` 15 times a second    | Move other players |
| `player:correct`    | `{ x, y, z }`                                                        | Server rejected your move: snap back here |
| `pandal:discovered` | `{ playerName, pandalName, pandalType, points, first, ... }`         | "Riya found Bagbazar +5" toast |
| `leaderboard:update`| `[{ rank, id, name, color, score, found }]`                          | Live leaderboard |
| `event:started`     | `{ type, name, description, effects, endsAt, data }`                 | Event banner; apply `effects.speedMultiplier` to movement |
| `event:ended`       | `{ type }`                                                           | Remove banner and effect |
| `game:ended`        | `{ reason, leaderboard[], winner }`                                  | Results screen |

Room `state` is one of `lobby`, `countdown`, `playing`, `ended`.

### Game rules the server enforces

- Two modes: **single player** (private room, starts at once) and **multiplayer** (2–8 players, join by code while in the lobby).
- Rounds last 120, 150 or 180 seconds (default 150), chosen by the player or host, after a 3-second countdown.
- Regular pandal +3, ghetto pandal +5, first player to find it +2.
- You must be within 8 units of a pandal to discover it.
- Moving faster than sprint speed, or off the map, gets corrected.
- Random events: double points, speed boost, rain (slower), and revealing a ghetto pandal (`data.x`, `data.z`).
- The round ends early if everyone finds every pandal. If players leave, the rest keep playing.

Pandal positions are in `server/src/pandals.js`, and the frontend can also load them from
`GET /api/pandals`. Speeds and points are in `GET /api/config`.

## Day and night

Each round runs the in-game clock from 4 PM to 6 AM: afternoon, dusk, Puja night, then dawn.
Every player gets the same time from `timer:tick` → `timeOfDay`:

- `light`: 1 = full daylight, 0.15 = darkest night. Use it for the sun's brightness, the sky colour, and turning on pandal lights when it is low.
- `phase`: `day`, `dusk`, `night` or `dawn`.
- `clock`: text like `"8:30 PM"` to show on screen.

```js
socket.on('timer:tick', ({ timeOfDay }) => {
  sun.intensity = timeOfDay.light;
  scene.background.setRGB(0.05 + 0.45 * timeOfDay.light, 0.05 + 0.6 * timeOfDay.light, 0.12 + 0.75 * timeOfDay.light);
  pandalLights.forEach((l) => (l.visible = timeOfDay.light < 0.6));
});
```

## Sound (music and Doppler effect)

`client/js/audio.js` is a ready-made sound engine. Every sound is generated in code, so there
are no audio files to download. It plays dhak at every pandal, crowd murmur and noisy "jhamela"
crowds with police whistles, honking cars on the roads, tanpura background music, and shankh
and bell effects. Sounds come from their real position in the city, and **cars and pandals change
pitch as you move past them (Doppler effect)**.

Try it: run the server and open http://localhost:3000/audio-test.html (headphones help).

```js
import { PandalAudio } from './js/audio.js';
const audio = new PandalAudio();
playButton.onclick = () => audio.start();               // phones only allow sound after a tap
socket.on('game:countdown', (d) => audio.setup(d));     // pandals + soundMap
socket.on('game:started', () => audio.playSfx('go'));
socket.on('timer:tick', (t) => audio.setLight(t.timeOfDay.light));
socket.on('event:started', (e) => audio.onEvent(e.type, true));
socket.on('event:ended', (e) => audio.onEvent(e.type, false));
socket.on('pandal:discovered', (d) => { if (d.playerId === socket.id) audio.playSfx(d.first ? 'first' : 'discover'); });
socket.on('game:ended', () => audio.playSfx('end'));
// every frame:
audio.update(player.position, camera.rotation.y, deltaSeconds);
```

Crowd zones and roads are in `server/src/soundMap.js`. Line the 3D roads up with them.

## Deploy

**Fastest: everything on Render as one service.** The server also serves `client/`,
so one Render URL works on any phone or computer.
New → Web Service → connect the GitHub repo, leave the root directory empty,
build command `npm run build`, start command `npm start`, instance type Free.
In the frontend use `io()` with no URL.

**Alternative, backend on Render:** New → Web Service → connect the GitHub repo.
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `CLIENT_ORIGIN` = your Vercel URL (e.g. `https://pandal-dash.vercel.app`)

**Frontend on Vercel:** import the same repo, set the root directory to `client`, and put the
Render URL in `SERVER_URL`.
