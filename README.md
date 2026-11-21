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

// Create a room (host)
socket.emit('room:create', { name: 'Riya' }, (res) => {
  if (!res.ok) return alert(res.error);
  console.log('Room code:', res.room.code); // show this so friends can join
});

// Join a room
socket.emit('room:join', { code: 'AB3CD', name: 'Arjun' }, (res) => {
  if (!res.ok) alert(res.error);
});

// Host starts the round (works solo too)
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
| `room:create`     | `{ name }`                        | `{ ok, playerId, room }`               |
| `room:join`       | `{ code, name }`                  | `{ ok, playerId, room }` or `{ ok:false, error }` |
| `room:leave`      | —                                 | `{ ok }`                               |
| `game:start`      | — (host only, solo is fine)       | `{ ok }` or `{ ok:false, error }`      |
| `player:move`     | `{ x, y, z, rotY, anim }`         | none                                   |
| `pandal:discover` | `{ pandalId }`                    | `{ ok, points, first, totalScore }` or `{ ok:false, error }` |
| `room:reset`      | — (host only, after the round)    | `{ ok }`                               |
| `ping:check`      | —                                 | `{ serverTime }`                       |

### Messages you receive (server → client)

| Event               | Data                                                                 | Use it for |
| ------------------- | -------------------------------------------------------------------- | ---------- |
| `room:update`       | `{ code, state, hostId, players[], endsAt, activeEvent, ... }`       | Lobby screen, player list |
| `player:left`       | `{ id, name }`                                                       | Remove their avatar |
| `game:countdown`    | `{ startsAt, endsAt, pandals[], players[] with spawn x/z }`          | Build pandals, place players, show 3-2-1 |
| `game:started`      | `{ startsAt, endsAt, serverTime }`                                   | Let players move |
| `timer:tick`        | `{ remainingMs }` every second                                       | Countdown timer |
| `state:snapshot`    | `{ t, players: [{ id, x, y, z, rotY, anim }] }` 15 times a second    | Move other players |
| `player:correct`    | `{ x, y, z }`                                                        | Server rejected your move: snap back here |
| `pandal:discovered` | `{ playerName, pandalName, pandalType, points, first, ... }`         | "Riya found Bagbazar +5" toast |
| `leaderboard:update`| `[{ rank, id, name, color, score, found }]`                          | Live leaderboard |
| `event:started`     | `{ type, name, description, effects, endsAt, data }`                 | Event banner; apply `effects.speedMultiplier` to movement |
| `event:ended`       | `{ type }`                                                           | Remove banner and effect |
| `game:ended`        | `{ reason, leaderboard[], winner }`                                  | Results screen |

Room `state` is one of `lobby`, `countdown`, `playing`, `ended`.

### Game rules the server enforces

- Play solo or with up to 8 players. You can only join while the room is in the lobby.
- Rounds last 150 seconds, after a 3-second countdown.
- Regular pandal +3, ghetto pandal +5, first player to find it +2.
- You must be within 8 units of a pandal to discover it.
- Moving faster than sprint speed, or off the map, gets corrected.
- Random events: double points, speed boost, rain (slower), and revealing a ghetto pandal (`data.x`, `data.z`).
- The round ends early if everyone finds every pandal. If players leave, the rest keep playing.

Pandal positions are in `server/src/pandals.js`, and the frontend can also load them from
`GET /api/pandals`. Speeds and points are in `GET /api/config`.

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
