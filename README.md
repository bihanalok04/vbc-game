# Pandal Dash — The Great Pandal Hunt

**Pandal-hopping in Kolkata during Durga Puja, as a real-time multiplayer 3D browser game.**
Race your friends through a 3D Kolkata to find pandals before time runs out. It works on
phones and laptops, with no install and no sign-in.

▶ **Play now: https://vbc-game.onrender.com**
*(Free hosting sleeps when idle, so the first load can take up to a minute. Please wait and refresh once.)*
🎬 **Demo video: [VIDEO LINK]**

Built at Vibe Coders Hackathon Edition 3, Kolkata.

## How to play

1. Enter your name and pick a round time: **2:00, 2:30 or 3:00**.
2. **Play solo**, or **Create room** and share the 5-letter code so friends can **Join** (2–8 players).
3. Explore the city: **WASD / arrow keys** or the **on-screen joystick**. **Shift** or the **sprint button** sprints, but it uses stamina. Drag to look around.
4. Walk up to a pandal to discover it:
   - Regular pandal **+3**
   - Hidden **ghetto pandal +5**
   - First player to find it **+2**
5. The arrow at the top points to the nearest pandal you haven't found. Ghetto pandals hide in the lanes and don't appear on it.
6. The highest score when the timer ends wins.

## Features

- **Real-time multiplayer** with Socket.IO: rooms with codes, live positions, a live leaderboard, and a server-controlled timer.
- **Fair play enforced by the server:** it checks every discovery against your distance, rejects impossible speeds and teleports, and awards the first-finder bonus to only one player.
- **A 3D Kolkata in Three.js:**
  - North-Kolkata buildings, yellow Ambassador taxis, tram tracks and the Hooghly riverbank
  - 10 big pandals with gates, name banners, Durga idols, fairy lights and light beams in the sky
  - 5 small hidden ghetto pandals
  - Every player gets the same city, generated from a fixed seed.
- **Day to night:** each round runs the city clock from 4 PM to 6 AM. The sky darkens, and windows, street lamps and pandals light up. All players see the same time.
- **Random events:**
  - *Dhunuchi Dance* gives double points.
  - *Dhaker Beat* gives a speed boost.
  - *Sudden Rain* slows everyone down.
  - *Para Gossip* reveals a hidden pandal.
- **3D sound with the Doppler effect,** all generated in code with no audio files:
  - dhak drums at every pandal, crowd murmur, and noisy "jhamela" crowds with police whistles
  - honking cars whose pitch shifts as they pass you
  - tanpura background music and the shankh (conch shell)
- **Works on phones:** touch joystick (the camera follows where you steer), sprint and jump buttons, a layout for small screens, and lighter graphics for phones.
- **Kolkata street food:** phuchka, kathi roll, jhalmuri, bhaar chai, rosogolla, ghugni and mishti doi stalls. Eat at one for an 8-second stamina surge.
- **8 Bengali characters** in the streets: a mota babu with his umbrella, a dhaki drumming with a kash-flower plume, a mashima in a laal-paar saree, a purohit with a smoking dhunuchi, a phuchkawala, a Kolkata traffic policeman in white, a College Street student with a jhola, and a kid with a balloon.
- **North-Kolkata lanes:** weathered orange and ochre walls, green-shuttered balconies, sagging overhead wires, parked motorbikes, coconut palms on the ghat.

## Tech stack

| Part | Technology |
|---|---|
| 3D game | Three.js, HTML, CSS, JavaScript (ES modules) |
| Real-time multiplayer | Socket.IO |
| Server | Node.js + Express |
| Sound | Web Audio API: sounds generated in code, 3D positional audio, Doppler |
| Hosting | Render (one free web service for the game and the server) |

## Project structure

```
vbc-game/
├── client/                 The game (served by the Node server)
│   ├── index.html          Menus, HUD, results
│   ├── css/style.css
│   └── js/
│       ├── main.js         Game flow: menus, rooms, HUD, networking
│       ├── world.js        3D Kolkata city and pandals
│       ├── player.js       Movement, third-person camera, sprint and stamina
│       ├── remotePlayers.js Other players with name tags
│       ├── touch.js        Phone joystick and sprint button
│       └── audio.js        3D sound engine with Doppler effect
├── server/
│   ├── src/
│   │   ├── index.js        HTTP routes and Socket.IO events
│   │   ├── Room.js         One game room: players, timer, scoring, events
│   │   ├── RoomManager.js  Room codes
│   │   ├── config.js       All tuning numbers
│   │   ├── pandals.js      Pandal positions
│   │   ├── soundMap.js     Crowd zones and roads for sound
│   │   ├── dayCycle.js     Shared day/night clock
│   │   └── events.js       Random events
│   └── test/simulate.js    Automated test: players play a full round
└── render.yaml             One-click Render deploy
```

## Run it locally

```
npm run build   # installs the server's packages
npm run dev     # starts the game at http://localhost:3000
npm test        # 28 automated checks: rooms, modes, scoring, anti-cheat, timer
```

Open http://localhost:3000 in two tabs to try multiplayer. To try the sound engine on its own,
open http://localhost:3000/audio-test.html.

## Sound credits

Real recordings from Wikimedia Commons, loaded in the browser:

- *Puja dhak.ogg*, by Tito Dutta, CC BY-SA 3.0
- *Durga Puja Dhak Dhol.ogg*, by Mamta Jagdish Dhody, CC BY-SA 4.0
- *Conch shell.ogg*, CC BY 2.5
- *large-crowd-medium-distance-stereo*, by eguobyte, CC0
- *Sounds of Traffic and Sellers.ogg*, CC BY-SA 4.0

If a recording can't load, the game falls back to a generated version of that sound.

## Team

| Member | Built |
|---|---|
| Sohom | Backend, multiplayer, scoring, sound engine, game flow |
| Bihan | Player movement, camera, stamina, phone controls, deployment |
| Susmit | City, roads, buildings and pandals |
| Pranjal | UI, menus, leaderboard and integration |

---

# Developer notes

## How the frontend talks to the backend

The game server also serves the Socket.IO client, so load it from there (no third-party CDN):

```js
const { io } = await import('/socket.io/socket.io.esm.min.js');
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

Everything runs on **Render as one free web service**: the Node server also serves `client/`,
so one Render URL works on any phone or computer, and the game connects back to the same address.

The easiest way is to use the `render.yaml` blueprint: Render → New → Blueprint → pick this repo → Apply.
To set it up by hand instead: New → Web Service → this repo, root directory empty, build command
`npm run build`, start command `npm start`, instance type Free.
