const config = require('./config');
const { PANDALS, SPAWN_POINTS, getPandal } = require('./pandals');
const { NO_EFFECTS, pickRandomEventType } = require('./events');
const { SOUND_MAP } = require('./soundMap');
const { timeOfDay } = require('./dayCycle');

// Playable characters (must match client/js/cityLife.js)
const CHARACTER_LOOKS = ['phuchkawala', 'purohit', 'motaBabu', 'teen', 'mashima', 'purohitBell', 'student', 'kid'];

function validDurationSec(sec) {
  const n = Number(sec);
  return config.ROUND_DURATION_OPTIONS_SEC.includes(n) ? n : null;
}

const PLAYER_COLORS = [
  '#e63946', '#f4a261', '#2a9d8f', '#457b9d',
  '#9b5de5', '#f15bb5', '#00bbf9', '#80b918',
];

// Room states:
//   lobby     -> waiting for players; host can start when MIN_PLAYERS are in
//   countdown -> short "3, 2, 1" before the round; players are frozen at spawn
//   playing   -> the round is running
//   ended     -> round over; final leaderboard shown; host can go back to lobby
class Room {
  constructor(code, io, onEmpty, options = {}) {
    this.code = code;
    this.io = io;
    this.onEmpty = onEmpty; // called when the last player leaves
    this.mode = options.mode === 'solo' ? 'solo' : 'multiplayer';
    this.durationSec = validDurationSec(options.durationSec) || config.DEFAULT_ROUND_DURATION_SEC;
    this.hostId = null;
    this.state = 'lobby';
    this.players = new Map(); // socket id -> player
    this.firstFinder = new Map(); // pandal id -> player id of first finder
    this.startsAt = null;
    this.endsAt = null;
    this.activeEvent = null;
    this.timers = { countdown: null, end: null, tick: null, snapshot: null, event: null, eventEnd: null };
  }

  // ---------- helpers ----------

  get channel() {
    return this.io.to(this.code);
  }

  get minPlayers() {
    return config.MODES[this.mode].minPlayers;
  }

  get maxPlayers() {
    return config.MODES[this.mode].maxPlayers;
  }

  get durationMs() {
    return this.durationSec * 1000;
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  effects() {
    return this.activeEvent ? this.activeEvent.effects : NO_EFFECTS;
  }

  nextColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[0];
  }

  publicPlayer(p) {
    return {
      id: p.id,
      name: p.name,
      character: p.character,
      color: p.color,
      score: p.score,
      discovered: [...p.discovered],
      isHost: p.id === this.hostId,
    };
  }

  publicState() {
    return {
      code: this.code,
      state: this.state,
      mode: this.mode,
      durationSec: this.durationSec,
      durationOptions: config.ROUND_DURATION_OPTIONS_SEC,
      hostId: this.hostId,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      activeEvent: this.activeEvent,
      firstFinders: Object.fromEntries(this.firstFinder),
    };
  }

  leaderboard() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score, found: p.discovered.size }))
      .sort((a, b) => b.score - a.score || b.found - a.found || a.name.localeCompare(b.name))
      .map((entry, i) => ({ rank: i + 1, ...entry }));
  }

  broadcastRoom() {
    this.channel.emit('room:update', this.publicState());
  }

  broadcastLeaderboard() {
    this.channel.emit('leaderboard:update', this.leaderboard());
  }

  // ---------- players joining and leaving ----------

  addPlayer(socket, name, character) {
    const player = {
      id: socket.id,
      name,
      character: CHARACTER_LOOKS.includes(character) ? character : CHARACTER_LOOKS[this.players.size % CHARACTER_LOOKS.length],
      color: this.nextColor(),
      score: 0,
      discovered: new Set(),
      x: 0, y: 0, z: 0, rotY: 0, anim: 'idle',
      lastMoveAt: Date.now(),
    };
    this.players.set(socket.id, player);
    if (!this.hostId) this.hostId = socket.id;
    socket.join(this.code);
    this.broadcastRoom();
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    this.players.delete(socketId);
    this.io.sockets.sockets.get(socketId)?.leave(this.code);

    if (this.players.size === 0) {
      this.destroy();
      this.onEmpty(this.code);
      return;
    }

    if (this.hostId === socketId) {
      this.hostId = this.players.keys().next().value; // oldest remaining player
    }

    this.channel.emit('player:left', { id: socketId, name: player.name });

    // Whoever is left keeps playing (solo is allowed), so the round continues.
    this.broadcastRoom();
    if (this.state === 'playing') this.broadcastLeaderboard();
  }

  // ---------- round lifecycle ----------

  startGame(requesterId) {
    if (requesterId !== this.hostId) return { ok: false, error: 'Only the host can start the game.' };
    if (this.state !== 'lobby') return { ok: false, error: 'The game has already started.' };
    if (this.players.size < this.minPlayers) {
      return { ok: false, error: `Multiplayer needs at least ${this.minPlayers} players. Share the room code!` };
    }

    // Reset everyone and put them on their spawn points.
    this.firstFinder.clear();
    this.activeEvent = null;
    let slot = 0;
    for (const p of this.players.values()) {
      const spawn = SPAWN_POINTS[slot++ % SPAWN_POINTS.length];
      Object.assign(p, { score: 0, x: spawn.x, y: 0, z: spawn.z, rotY: 0, anim: 'idle' });
      p.discovered = new Set();
    }

    const now = Date.now();
    this.state = 'countdown';
    this.startsAt = now + config.COUNTDOWN_MS;
    this.endsAt = this.startsAt + this.durationMs;

    this.channel.emit('game:countdown', {
      mode: this.mode,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      serverTime: now,
      durationMs: this.durationMs,
      timeOfDay: timeOfDay(0),
      pandals: PANDALS,
      soundMap: SOUND_MAP,
      players: [...this.players.values()].map((p) => ({
        ...this.publicPlayer(p), x: p.x, y: p.y, z: p.z, rotY: p.rotY,
      })),
    });
    this.broadcastRoom();

    this.timers.countdown = setTimeout(() => this.beginRound(), config.COUNTDOWN_MS);
    return { ok: true };
  }

  beginRound() {
    this.state = 'playing';
    const now = Date.now();
    for (const p of this.players.values()) p.lastMoveAt = now;

    this.channel.emit('game:started', { startsAt: this.startsAt, endsAt: this.endsAt, serverTime: now });
    this.broadcastRoom();
    this.broadcastLeaderboard();

    this.timers.tick = setInterval(() => {
      const t = Date.now();
      const remainingMs = Math.max(0, this.endsAt - t);
      this.channel.emit('timer:tick', {
        remainingMs,
        serverTime: t,
        timeOfDay: timeOfDay(1 - remainingMs / this.durationMs),
      });
    }, 1000);

    this.timers.snapshot = setInterval(() => this.sendSnapshot(), 1000 / config.SNAPSHOT_RATE_HZ);
    this.timers.end = setTimeout(() => this.endGame('time-up'), this.endsAt - now);
    this.scheduleNextEvent(config.EVENT_FIRST_DELAY_MS);
  }

  endGame(reason) {
    this.clearRoundTimers();
    this.state = 'ended';
    this.activeEvent = null;
    const leaderboard = this.leaderboard();
    this.channel.emit('game:ended', {
      reason, // 'time-up' | 'all-found'
      leaderboard,
      winner: leaderboard[0] || null,
    });
    this.broadcastRoom();
  }

  // Host changes the room settings while in the lobby (or after a round).
  updateSettings(requesterId, settings = {}) {
    if (requesterId !== this.hostId) return { ok: false, error: 'Only the host can change settings.' };
    if (this.state === 'countdown' || this.state === 'playing') {
      return { ok: false, error: 'You cannot change settings during a round.' };
    }
    if (settings.durationSec !== undefined) {
      const sec = validDurationSec(settings.durationSec);
      if (!sec) {
        return { ok: false, error: `Time must be one of ${config.ROUND_DURATION_OPTIONS_SEC.join(', ')} seconds.` };
      }
      this.durationSec = sec;
    }
    this.broadcastRoom();
    return { ok: true, durationSec: this.durationSec };
  }

  // Host takes everyone from the results screen back to the lobby for another round.
  resetToLobby(requesterId) {
    if (requesterId !== this.hostId) return { ok: false, error: 'Only the host can do that.' };
    if (this.state !== 'ended') return { ok: false, error: 'The round is not over yet.' };
    this.state = 'lobby';
    this.startsAt = null;
    this.endsAt = null;
    this.firstFinder.clear();
    for (const p of this.players.values()) {
      p.score = 0;
      p.discovered = new Set();
    }
    this.broadcastRoom();
    return { ok: true };
  }

  // ---------- movement ----------

  sendSnapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({ id: p.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY, anim: p.anim });
    }
    // volatile: if a client is lagging, drop old snapshots instead of queueing them
    this.channel.volatile.emit('state:snapshot', { t: Date.now(), players });
  }

  handleMove(socket, data) {
    if (this.state !== 'playing') return;
    const p = this.players.get(socket.id);
    if (!p || !data) return;

    const x = Number(data.x);
    const y = Number(data.y) || 0;
    const z = Number(data.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return;

    const now = Date.now();
    // Don't let a player "save up" distance by standing still.
    const dt = Math.min(now - p.lastMoveAt, 1000) / 1000;
    const maxDist =
      config.SPRINT_SPEED * this.effects().speedMultiplier * config.SPEED_TOLERANCE * dt + 1;
    const dist = Math.hypot(x - p.x, z - p.z);
    const limit = config.WORLD_HALF_SIZE;
    const inBounds = Math.abs(x) <= limit && Math.abs(z) <= limit;

    if (dist > maxDist || !inBounds) {
      // Too fast or off the map: snap the player back to the last good position.
      socket.emit('player:correct', { x: p.x, y: p.y, z: p.z });
      p.lastMoveAt = now;
      return;
    }

    p.x = x;
    p.y = y;
    p.z = z;
    if (Number.isFinite(Number(data.rotY))) p.rotY = Number(data.rotY);
    if (typeof data.anim === 'string') p.anim = data.anim.slice(0, 16);
    p.lastMoveAt = now;
  }

  // ---------- discovery and scoring ----------

  handleDiscover(socketId, pandalId) {
    if (this.state !== 'playing') return { ok: false, error: 'The round is not running.' };
    const p = this.players.get(socketId);
    if (!p) return { ok: false, error: 'You are not in this room.' };

    const pandal = getPandal(pandalId);
    if (!pandal) return { ok: false, error: 'Unknown pandal.' };
    if (p.discovered.has(pandal.id)) return { ok: false, error: 'You already found this pandal.' };

    const dist = Math.hypot(p.x - pandal.x, p.z - pandal.z);
    if (dist > config.DISCOVERY_RADIUS) {
      return { ok: false, error: 'Too far away. Get closer to the pandal.' };
    }

    const base = config.POINTS[pandal.type];
    const isFirst = !this.firstFinder.has(pandal.id);
    const bonus = isFirst ? config.POINTS.firstDiscoveryBonus : 0;
    const multiplier = this.effects().pointsMultiplier;
    const points = (base + bonus) * multiplier;

    p.discovered.add(pandal.id);
    p.score += points;
    if (isFirst) this.firstFinder.set(pandal.id, p.id);

    this.channel.emit('pandal:discovered', {
      playerId: p.id,
      playerName: p.name,
      pandalId: pandal.id,
      pandalName: pandal.name,
      pandalType: pandal.type,
      points,
      breakdown: { base, firstBonus: bonus, multiplier },
      first: isFirst,
      totalScore: p.score,
    });
    this.broadcastLeaderboard();

    // End early if every player has found every pandal.
    const everyoneDone = [...this.players.values()].every((pl) => pl.discovered.size === PANDALS.length);
    if (everyoneDone) this.endGame('all-found');

    return { ok: true, points, first: isFirst, totalScore: p.score };
  }

  // ---------- random events ----------

  scheduleNextEvent(delayMs) {
    clearTimeout(this.timers.event);
    // Don't start an event that would run past the end of the round.
    if (Date.now() + delayMs > this.endsAt - 10 * 1000) return;
    this.timers.event = setTimeout(() => this.startRandomEvent(), delayMs);
  }

  startRandomEvent() {
    if (this.state !== 'playing') return;
    const type = pickRandomEventType();
    const now = Date.now();
    const event = {
      type: type.type,
      name: type.name,
      description: type.description,
      effects: type.effects,
      startedAt: now,
      endsAt: now + type.durationMs,
      data: {},
    };

    if (type.needsGhettoPandal) {
      // Prefer a ghetto pandal nobody has found yet.
      const ghettos = PANDALS.filter((pd) => pd.type === 'ghetto');
      const unfound = ghettos.filter((pd) => !this.firstFinder.has(pd.id));
      const pool = unfound.length ? unfound : ghettos;
      const target = pool[Math.floor(Math.random() * pool.length)];
      event.data = { pandalId: target.id, x: target.x, z: target.z };
    }

    this.activeEvent = event;
    this.channel.emit('event:started', event);

    this.timers.eventEnd = setTimeout(() => {
      this.activeEvent = null;
      this.channel.emit('event:ended', { type: event.type });
      const gap =
        config.EVENT_MIN_GAP_MS + Math.random() * (config.EVENT_MAX_GAP_MS - config.EVENT_MIN_GAP_MS);
      this.scheduleNextEvent(gap);
    }, type.durationMs);
  }

  // ---------- cleanup ----------

  clearRoundTimers() {
    clearTimeout(this.timers.countdown);
    clearTimeout(this.timers.end);
    clearTimeout(this.timers.event);
    clearTimeout(this.timers.eventEnd);
    clearInterval(this.timers.tick);
    clearInterval(this.timers.snapshot);
  }

  destroy() {
    this.clearRoundTimers();
  }
}

module.exports = Room;
