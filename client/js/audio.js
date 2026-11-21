// Pandal Dash sound engine: 3D positional audio with the Doppler effect.
//
// Every sound is generated in code with the Web Audio API, so there are no audio
// files to download. What you hear:
//   - dhak drums (with kashor gong) at every pandal, louder at big ones
//   - crowd murmur, and "jhamela" crowds with police whistles
//   - cars driving on the roads, honking, with Doppler pitch shift as they pass
//   - tanpura drone background music, shankh (conch) and bell sound effects
//   - rain during the rain event; crowds get livelier at night
//
// Doppler effect: for every sound source we measure how fast its distance to the
// player is changing. Coming closer -> pitch goes up; moving away -> pitch drops.
// It works both when a car passes you and when you sprint past a pandal.
//
// How the frontend uses it (Three.js example):
//
//   import { PandalAudio } from './js/audio.js';
//   const audio = new PandalAudio();
//   startButton.onclick = () => audio.start();          // must follow a tap/click (phones require it)
//   socket.on('game:countdown', (d) => audio.setup(d));  // d has pandals + soundMap
//   socket.on('game:started', () => audio.playSfx('go'));
//   socket.on('timer:tick', (t) => audio.setLight(t.timeOfDay.light));
//   socket.on('event:started', (e) => audio.onEvent(e.type, true));
//   socket.on('event:ended', (e) => audio.onEvent(e.type, false));
//   socket.on('pandal:discovered', (d) => { if (d.playerId === socket.id) audio.playSfx(d.first ? 'first' : 'discover'); });
//   socket.on('game:ended', () => audio.playSfx('end'));
//   // in your animation loop:
//   audio.update(player.position, camera.rotation.y, deltaSeconds);

const SPEED_OF_SOUND = 343;
// Real Doppler at walking/car speeds is subtle. Dividing the speed of sound makes
// the effect easy to hear in a game. 1 = realistic, 3 = clearly audible.
const DOPPLER_EXAGGERATION = 3;
const IS_MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Limits keep phones fast: only the nearest sources actually play.
const MAX_ACTIVE_DHAK = IS_MOBILE ? 3 : 5;
const MAX_ACTIVE_CROWDS = IS_MOBILE ? 2 : 4;
const MAX_CARS = IS_MOBILE ? 2 : 4;
const AUDIBLE_RANGE = 70;

// ---------------------------------------------------------------------------
// Sound synthesis: each function fills a buffer with generated samples.
// Loops write with wrap-around so the end blends seamlessly into the start.
// ---------------------------------------------------------------------------

function makeBuffer(ctx, seconds, fill) {
  const length = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  fill(data, ctx.sampleRate, length);
  normalize(data, 0.9);
  return buffer;
}

function normalize(data, peak) {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < data.length; i++) data[i] *= k;
  }
}

// A drum hit whose pitch drops quickly, plus a noise "slap".
function addDrum(data, sr, len, t0, { f0, f1, decay, slap = 0.3, gain = 1, wrap = true }) {
  const start = Math.floor(t0 * sr);
  const n = Math.floor(decay * 6 * sr);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const freq = f1 + (f0 - f1) * Math.exp(-t * 35);
    phase += (2 * Math.PI * freq) / sr;
    const body = Math.sin(phase) * Math.exp(-t / decay);
    const noise = (Math.random() * 2 - 1) * Math.exp(-t / 0.015) * slap;
    const idx = wrap ? (start + i) % len : start + i;
    if (idx < len) data[idx] += (body + noise) * gain;
  }
}

// Metallic ring (kashor gong, bells): inharmonic partials that decay.
function addBell(data, sr, len, t0, { freq, partials, decay, gain = 1, wrap = true }) {
  const start = Math.floor(t0 * sr);
  const n = Math.floor(decay * 5 * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    partials.forEach((p, k) => {
      s += Math.sin(2 * Math.PI * freq * p * t) * Math.exp(-t / (decay / (1 + k * 0.6))) / (k + 1);
    });
    const attack = Math.min(1, t / 0.002);
    const idx = wrap ? (start + i) % len : start + i;
    if (idx < len) data[idx] += s * attack * gain;
  }
}

function dhakLoop(ctx, { withKashor = true, busy = true } = {}) {
  // A dhak "bol" at 140 BPM: 16 eighth-note steps, 2 bars.
  const bpm = 140;
  const step = 60 / bpm / 2;
  const seconds = step * 16;
  // D = deep hit, t = sharp slap, . = rest
  const pattern = busy ? 'D.tD.tDtD.tD.ttt' : 'D...t.D...t.D.t.';
  return makeBuffer(ctx, seconds, (data, sr, len) => {
    [...pattern].forEach((ch, i) => {
      const t = i * step + (Math.random() - 0.5) * 0.008; // tiny human timing wobble
      if (ch === 'D') addDrum(data, sr, len, t, { f0: 170, f1: 72, decay: 0.16, slap: 0.35, gain: 1 });
      if (ch === 't') addDrum(data, sr, len, t, { f0: 420, f1: 260, decay: 0.05, slap: 0.6, gain: 0.55 });
    });
    if (withKashor) {
      for (let i = 0; i < 16; i += 2) {
        addBell(data, sr, len, i * step, { freq: 1250, partials: [1, 2.76, 5.4, 8.93], decay: 0.12, gain: i % 4 === 0 ? 0.25 : 0.15 });
      }
    }
  });
}

// Many people talking: band-limited noise shaped into syllables.
function crowdLoop(ctx, { voices = 14, seconds = 4 } = {}) {
  return makeBuffer(ctx, seconds, (data, sr, len) => {
    for (let v = 0; v < voices; v++) {
      const lpFast = 0.05 + Math.random() * 0.12; // sets the voice's "brightness"
      const lpSlow = lpFast * 0.25;
      let a = 0;
      let b = 0;
      let syllableEnd = 0;
      let amp = 0;
      let target = 0;
      const offset = Math.floor(Math.random() * len);
      for (let i = 0; i < len; i++) {
        if (i >= syllableEnd) {
          // next syllable or pause, 80-260 ms
          syllableEnd = i + Math.floor((0.08 + Math.random() * 0.18) * sr);
          target = Math.random() < 0.7 ? 0.4 + Math.random() * 0.6 : 0;
        }
        amp += (target - amp) * 0.002;
        const x = Math.random() * 2 - 1;
        a += lpFast * (x - a);
        b += lpSlow * (a - b);
        data[(i + offset) % len] += (a - b) * amp;
      }
    }
  });
}

function noiseLoop(ctx, seconds = 2) {
  return makeBuffer(ctx, seconds, (data) => {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  });
}

// Car/auto-rickshaw engine hum. 1 s at 50 Hz = whole cycles, so it loops cleanly.
function engineLoop(ctx) {
  return makeBuffer(ctx, 1, (data, sr, len) => {
    let rumble = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let s = 0;
      for (let h = 1; h <= 8; h++) s += Math.sin(2 * Math.PI * 50 * h * t) / h;
      s *= 0.7 + 0.3 * Math.sin(2 * Math.PI * 6 * t); // engine "putt-putt"
      rumble += 0.02 * (Math.random() * 2 - 1 - rumble);
      data[i] = s * 0.5 + rumble * 2;
    }
  });
}

// Horn: two slightly clashing reedy tones. kind: 'short' | 'double' | 'long'.
function hornSound(ctx, kind) {
  const beeps = kind === 'double' ? [[0, 0.18], [0.26, 0.2]] : kind === 'long' ? [[0, 0.8]] : [[0, 0.3]];
  const freqs = kind === 'long' ? [392, 494] : [440, 554];
  const seconds = beeps[beeps.length - 1][0] + beeps[beeps.length - 1][1] + 0.05;
  return makeBuffer(ctx, seconds, (data, sr) => {
    for (const [start, dur] of beeps) {
      const s0 = Math.floor(start * sr);
      const n = Math.floor(dur * sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.01) * Math.min(1, (dur - t) / 0.02);
        let s = 0;
        for (const f of freqs) for (let h = 1; h <= 7; h += 2) s += Math.sin(2 * Math.PI * f * h * t) / h;
        data[s0 + i] += Math.tanh(s * 1.5) * env;
      }
    }
  });
}

// Police whistle: high tone with a fast trill.
function whistleSound(ctx) {
  return makeBuffer(ctx, 0.9, (data, sr, len) => {
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const freq = 2900 + 220 * Math.sign(Math.sin(2 * Math.PI * 28 * t));
      phase += (2 * Math.PI * freq) / sr;
      const env = Math.min(1, t / 0.02) * Math.min(1, (0.9 - t) / 0.08) * (t > 0.35 && t < 0.45 ? 0.1 : 1);
      data[i] = Math.sin(phase) * env + (Math.random() * 2 - 1) * 0.05 * env;
    }
  });
}

// Shankh (conch shell): breathy horn that swells, with vibrato.
function shankhSound(ctx, seconds = 1.6) {
  return makeBuffer(ctx, seconds, (data, sr, len) => {
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const freq = 300 * (1 + 0.03 * Math.min(1, t / 0.4)) * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t));
      phase += (2 * Math.PI * freq) / sr;
      let s = 0;
      for (let h = 1; h <= 9; h++) s += Math.sin(phase * h) * (h % 2 ? 1 : 0.5) / h;
      const env = Math.min(1, t / 0.35) * Math.min(1, (seconds - t) / 0.3);
      data[i] = Math.tanh(s * 1.2) * env + (Math.random() * 2 - 1) * 0.04 * env;
    }
  });
}

// Tanpura drone (Pa-Sa-Sa-Sa), the background music. 4 s loop.
function tanpuraLoop(ctx) {
  const SA = 130.75; // multiples of 0.25 Hz loop seamlessly over 4 seconds
  const notes = [SA * 1.5, SA * 2, SA * 2, SA];
  return makeBuffer(ctx, 4, (data, sr, len) => {
    notes.forEach((f, k) => {
      const start = Math.floor(k * sr);
      const n = len; // let each string ring for the whole loop
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let s = 0;
        for (let h = 1; h <= 10; h++) {
          // tanpura "jivari" buzz: upper harmonics swell slightly after the pluck
          const swell = 1 + 0.6 * Math.sin(Math.PI * Math.min(1, t / 2.5)) * (h > 3 ? 1 : 0);
          s += (Math.sin(2 * Math.PI * f * h * t) / (h * 1.3)) * swell;
        }
        data[(start + i) % len] += s * Math.exp(-t / 1.6) * Math.min(1, t / 0.01);
      }
    });
  });
}

function chimeSound(ctx, first) {
  return makeBuffer(ctx, first ? 1.4 : 1, (data, sr, len) => {
    addBell(data, sr, len, 0, { freq: 880, partials: [1, 2, 3.01, 4.2], decay: 0.35, wrap: false });
    if (first) {
      addBell(data, sr, len, 0.12, { freq: 1108, partials: [1, 2, 3.01], decay: 0.35, wrap: false });
      addBell(data, sr, len, 0.24, { freq: 1318, partials: [1, 2, 3.01, 4.2], decay: 0.5, wrap: false });
    }
  });
}

// "Ghee khatam!" sting: a loud, comic sad-trombone "wah wah wah waaah" with a drum hit.
function gheeOutSound(ctx) {
  const notes = [[0, 0.28, 311], [0.3, 0.28, 293], [0.6, 0.28, 277], [0.9, 1.0, 261]];
  return makeBuffer(ctx, 2.0, (data, sr, len) => {
    addDrum(data, sr, len, 0, { f0: 160, f1: 55, decay: 0.25, slap: 0.5, gain: 1.2, wrap: false });
    for (const [start, dur, f] of notes) {
      const s0 = Math.floor(start * sr);
      let phase = 0;
      for (let i = 0; i < dur * sr && s0 + i < len; i++) {
        const t = i / sr;
        const last = dur > 0.5;
        const freq = f * (1 + (last ? 0.03 * Math.sin(2 * Math.PI * 6 * t) : 0)) * (last ? 1 - 0.04 * t : 1);
        phase += (2 * Math.PI * freq) / sr;
        let s = 0;
        for (let h = 1; h <= 8; h++) s += Math.sin(phase * h) / h; // brassy sawtooth
        const env = Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.08);
        data[s0 + i] += Math.tanh(s * 1.4) * env * 0.9;
      }
    }
  });
}

function beepSound(ctx, freq) {
  return makeBuffer(ctx, 0.18, (data, sr, len) => {
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      data[i] = Math.sin(2 * Math.PI * freq * t) * Math.min(1, t / 0.005) * Math.exp(-t / 0.08);
    }
  });
}

// ---------------------------------------------------------------------------
// Positional sound sources
// ---------------------------------------------------------------------------

class Emitter {
  // A looping sound at a position, routed through a 3D panner. Tracks its
  // distance to the listener every frame to work out the Doppler pitch shift.
  constructor(engine, { x, y = 1.5, z, buffer, bus, gain = 1, refDistance = 6, rate = 1 }) {
    Object.assign(this, { engine, x, y, z, buffer, bus, baseGain: gain, refDistance, baseRate: rate });
    this.active = false;
    this.prevDist = null;
    this.doppler = 1;
    this.gainMul = 1;
    this.rateMul = 1;
  }

  start() {
    if (this.active) return;
    const { ctx } = this.engine;
    this.panner = this.engine.makePanner(this.refDistance);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.src = ctx.createBufferSource();
    this.src.buffer = this.buffer;
    this.src.loop = true;
    this.src.playbackRate.value = this.baseRate;
    this.src.connect(this.gain).connect(this.panner).connect(this.bus);
    this.src.start(0, Math.random() * this.buffer.duration); // random offset so pandals aren't in sync
    this.gain.gain.setTargetAtTime(this.baseGain * this.gainMul, ctx.currentTime, 0.3);
    this.active = true;
    this.prevDist = null;
    setPannerPosition(this.panner, this.x, this.y, this.z, ctx.currentTime, true);
  }

  stop() {
    if (!this.active) return;
    const { ctx } = this.engine;
    const { src, gain, panner } = this;
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    setTimeout(() => {
      try { src.stop(); } catch (_) { /* already stopped */ }
      src.disconnect(); gain.disconnect(); panner.disconnect();
    }, 1500);
    this.active = false;
  }

  setPosition(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    if (this.active) setPannerPosition(this.panner, x, y, z, this.engine.ctx.currentTime);
  }

  distanceTo(l) {
    return Math.hypot(this.x - l.x, this.y - l.y, this.z - l.z);
  }

  // Doppler: radial speed = how fast the distance changes (positive = moving apart).
  updateDoppler(listener, dt) {
    const d = this.distanceTo(listener);
    if (this.prevDist !== null && dt > 0) {
      const c = SPEED_OF_SOUND / DOPPLER_EXAGGERATION;
      const radialSpeed = Math.max(-c * 0.5, Math.min(c * 0.5, (d - this.prevDist) / dt));
      const target = c / (c + radialSpeed);
      this.doppler += (target - this.doppler) * Math.min(1, dt * 8); // smooth out frame jitter
    }
    this.prevDist = d;
    if (this.active) {
      const t = this.engine.ctx.currentTime;
      this.src.playbackRate.setTargetAtTime(this.baseRate * this.rateMul * this.doppler, t, 0.05);
    }
    return d;
  }

  setLevel(gainMul, rateMul = 1) {
    this.gainMul = gainMul;
    this.rateMul = rateMul;
    if (this.active) this.gain.gain.setTargetAtTime(this.baseGain * gainMul, this.engine.ctx.currentTime, 0.4);
  }

  // One-shot sound from this source's position (a car's horn, a whistle in a crowd).
  playOneShot(buffer, gain = 1) {
    if (!this.active) return;
    const { ctx } = this.engine;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = this.doppler; // the horn gets the same Doppler shift
    g.gain.value = gain;
    src.connect(g).connect(this.panner);
    src.start();
    src.onended = () => { src.disconnect(); g.disconnect(); };
  }
}

function setPannerPosition(p, x, y, z, t, immediate = false) {
  if (p.positionX && immediate) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else if (p.positionX) {
    p.positionX.setTargetAtTime(x, t, 0.02);
    p.positionY.setTargetAtTime(y, t, 0.02);
    p.positionZ.setTargetAtTime(z, t, 0.02);
  } else {
    p.setPosition(x, y, z); // older Safari/Firefox
  }
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export class PandalAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.light = 1;
    this.events = new Set();
    this.dhaks = [];
    this.crowds = [];
    this.cars = [];
    this.roads = [];
    this.listener = { x: 0, y: 1.6, z: 0 };
    this.timeToNextCar = 1;
  }

  // Call from a click/tap handler: browsers only allow audio after a user gesture.
  async start() {
    if (this.started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    await this.ctx.resume();
    const ctx = this.ctx;

    // Mixer: music / ambience / sfx -> compressor -> speakers
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.ambienceBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.gain.value = 0.18;
    this.ambienceBus.gain.value = 0.9;
    this.sfxBus.gain.value = 0.7;
    [this.musicBus, this.ambienceBus, this.sfxBus].forEach((b) => b.connect(this.master));

    // Dhak channel: boosted bass for the deep drum thump, a little extra snap
    // on the stick hits, and its own level so it stands out over the crowd.
    this.dhakBus = ctx.createGain();
    this.dhakBus.gain.value = 1.35;
    const dhakBass = ctx.createBiquadFilter();
    dhakBass.type = 'lowshelf';
    dhakBass.frequency.value = 180;
    dhakBass.gain.value = 8;
    const dhakSnap = ctx.createBiquadFilter();
    dhakSnap.type = 'peaking';
    dhakSnap.frequency.value = 2600;
    dhakSnap.Q.value = 0.9;
    dhakSnap.gain.value = 4;
    this.dhakBus.connect(dhakBass).connect(dhakSnap).connect(this.ambienceBus);

    // Generate all sounds once.
    this.buffers = {
      dhakBig: dhakLoop(ctx, { withKashor: true, busy: true }),
      dhakSmall: dhakLoop(ctx, { withKashor: false, busy: false }),
      crowd: crowdLoop(ctx, { voices: 14 }),
      jhamela: crowdLoop(ctx, { voices: 26 }),
      noise: noiseLoop(ctx),
      engine: engineLoop(ctx),
      horns: [hornSound(ctx, 'short'), hornSound(ctx, 'double'), hornSound(ctx, 'long')],
      whistle: whistleSound(ctx),
      shankh: shankhSound(ctx, 1.6),
      shankhLong: shankhSound(ctx, 2.6),
      tanpura: tanpuraLoop(ctx),
      discover: chimeSound(ctx, false),
      first: chimeSound(ctx, true),
      beep: beepSound(ctx, 660),
      beepHigh: beepSound(ctx, 990),
      gheeOut: gheeOutSound(ctx),
    };

    // No synthesized background drone any more (it buzzed). The real dhak at the
    // pandals is the music. Real recordings replace the generated sounds as they load.
    this.loadRecordings();

    // Rain bed for the rain event (silent until needed).
    const rain = ctx.createBufferSource();
    rain.buffer = this.buffers.noise;
    rain.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(hp).connect(this.rainGain).connect(this.ambienceBus);
    rain.start();

    this.started = true;
    if (this.pendingSetup) this.setup(this.pendingSetup);
  }

  // Real recordings from Wikimedia Commons (free licences, credited in README.md),
  // loaded straight into the player's browser. If one fails to load, the
  // generated version stays in its place.
  async loadRecordings() {
    const base = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/';
    const files = {
      dhak: `${base}0/04/Puja_dhak.ogg/Puja_dhak.ogg.mp3`,
      dhak2: `${base}4/46/Durga_Puja_Dhak_Dhol.ogg/Durga_Puja_Dhak_Dhol.ogg.mp3`,
      shankh: `${base}2/24/Conch_shell.ogg/Conch_shell.ogg.mp3`,
      crowd: `${base}a/a9/360703_eguobyte_large-crowd-medium-distance-stereo.wav/360703_eguobyte_large-crowd-medium-distance-stereo.wav.mp3`,
      traffic: `${base}2/27/Sounds_of_Traffic_and_Sellers.ogg/Sounds_of_Traffic_and_Sellers.ogg.mp3`,
    };
    this.real = {};
    await Promise.all(Object.entries(files).map(async ([key, url]) => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(res.status);
        this.real[key] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (err) {
        console.warn(`Sound "${key}" could not load, using the generated one`, err);
      }
    }));
    const r = this.real;
    if (r.dhak) { this.buffers.dhakBig = r.dhak; this.buffers.dhakSmall = r.dhak2 || r.dhak; }
    else if (r.dhak2) { this.buffers.dhakBig = this.buffers.dhakSmall = r.dhak2; }
    if (r.crowd) { this.buffers.crowd = r.crowd; this.buffers.jhamela = r.crowd; }
    if (r.traffic) this.buffers.engine = r.traffic;
    if (r.shankh) { this.buffers.shankh = r.shankh; this.buffers.shankhLong = r.shankh; }
    // Swap the new recordings into sources that are already playing.
    for (const e of [...this.dhaks, ...this.crowds]) {
      e.buffer = e.jhamela !== undefined ? this.buffers.crowd : (e.small ? this.buffers.dhakSmall : this.buffers.dhakBig);
      if (e.active) e.stop(); // restarts with the real sound on the next frame
    }
    this.cars.forEach((c) => { c.buffer = this.buffers.engine; if (c.active) c.dead = true; });
  }

  makePanner(refDistance) {
    const p = this.ctx.createPanner();
    p.panningModel = IS_MOBILE ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = 1.3;
    p.maxDistance = 1000;
    return p;
  }

  // data: the game:countdown payload, or { pandals, crowdZones, roads } from /api/sound-map.
  setup(data) {
    if (!this.started) { this.pendingSetup = data; return; }
    this.clear();
    const map = data.soundMap || data;
    for (const p of data.pandals || []) {
      const big = p.type !== 'ghetto';
      const dhak = new Emitter(this, {
        x: p.x, z: p.z, y: 2,
        buffer: big ? this.buffers.dhakBig : this.buffers.dhakSmall,
        bus: this.dhakBus,
        gain: big ? 1.5 : 0.95,
        refDistance: big ? 14 : 8, // carries farther down the lanes
      });
      dhak.small = !big;
      this.dhaks.push(dhak);
    }
    for (const c of map.crowdZones || []) {
      const loud = c.intensity === 'jhamela';
      const e = new Emitter(this, {
        x: c.x, z: c.z, y: 1.6,
        buffer: loud ? this.buffers.jhamela : this.buffers.crowd,
        bus: this.ambienceBus,
        gain: loud ? 0.9 : 0.55,
        refDistance: Math.max(6, c.radius * 0.5),
      });
      e.jhamela = loud;
      e.nextWhistle = 3 + Math.random() * 6;
      this.crowds.push(e);
    }
    this.roads = map.roads || [];
    this.applyLevels();
  }

  clear() {
    [...this.dhaks, ...this.crowds, ...this.cars].forEach((e) => e.stop());
    this.dhaks = [];
    this.crowds = [];
    this.cars = [];
  }

  // Call every frame. position: {x,y,z} of the player (or camera).
  // yaw: the direction the camera faces, in radians (Three.js camera.rotation.y
  // or your player's rotation.y; 0 = looking toward -Z).
  update(position, yaw = 0, dt = 1 / 60) {
    if (!this.started || dt <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const l = this.listener;
    l.x = position.x; l.y = (position.y || 0) + 1.6; l.z = position.z;

    const L = ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (L.positionX) {
      L.positionX.setTargetAtTime(l.x, t, 0.02);
      L.positionY.setTargetAtTime(l.y, t, 0.02);
      L.positionZ.setTargetAtTime(l.z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02);
      L.forwardY.setTargetAtTime(0, t, 0.02);
      L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(l.x, l.y, l.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }

    this.updateNearest(this.dhaks, MAX_ACTIVE_DHAK, dt, 100); // dhak is heard from farther away
    this.updateNearest(this.crowds, MAX_ACTIVE_CROWDS, dt);

    // Police whistles in jhamela crowds (only with the generated crowd; the real
    // recording already sounds like a real crowd)
    for (const c of this.crowds) {
      if (!c.active || !c.jhamela || this.real?.crowd) continue;
      c.nextWhistle -= dt;
      if (c.nextWhistle <= 0) {
        c.playOneShot(this.buffers.whistle, 0.5);
        c.nextWhistle = 4 + Math.random() * 8;
      }
    }

    this.updateCars(dt);
  }

  // Only the closest few sources play; the rest fade out to save CPU.
  updateNearest(list, maxActive, dt, range = AUDIBLE_RANGE) {
    const ranked = list
      .map((e) => ({ e, d: e.updateDoppler(this.listener, dt) }))
      .sort((a, b) => a.d - b.d);
    ranked.forEach(({ e, d }, i) => {
      if (i < maxActive && d < range) e.start();
      else e.stop();
    });
  }

  updateCars(dt) {
    // Move cars and remove the ones that are far away or off the road.
    for (const car of this.cars) {
      car.pos += car.dir * car.speed * dt;
      const r = car.road;
      const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
      const k = car.pos / len;
      car.setPosition(r.x1 + (r.x2 - r.x1) * k, 1, r.z1 + (r.z2 - r.z1) * k);
      const d = car.updateDoppler(this.listener, dt);
      car.honkIn -= dt;
      if (car.honkIn <= 0 && !this.real?.traffic) {
        const horns = this.buffers.horns;
        car.playOneShot(horns[Math.floor(Math.random() * horns.length)], 0.8);
        car.honkIn = 2 + Math.random() * 5;
      }
      if (d > AUDIBLE_RANGE + 20 || car.pos < -5 || car.pos > len + 5) car.dead = true;
    }
    this.cars = this.cars.filter((c) => {
      if (c.dead) c.stop();
      return !c.dead;
    });

    // Spawn new cars on roads near the player.
    this.timeToNextCar -= dt;
    if (this.cars.length < MAX_CARS && this.timeToNextCar <= 0 && this.roads.length) {
      this.timeToNextCar = 1.5 + Math.random() * 3;
      this.spawnCar();
    }
  }

  spawnCar() {
    const l = this.listener;
    // Find roads close to the player and the point on each nearest to them.
    const options = this.roads
      .map((r) => {
        const vx = r.x2 - r.x1;
        const vz = r.z2 - r.z1;
        const len = Math.hypot(vx, vz);
        const along = Math.max(0, Math.min(len, ((l.x - r.x1) * vx + (l.z - r.z1) * vz) / len));
        const px = r.x1 + (vx / len) * along;
        const pz = r.z1 + (vz / len) * along;
        return { r, len, along, dist: Math.hypot(l.x - px, l.z - pz) };
      })
      .filter((o) => o.dist < 45);
    if (!options.length) return;
    const o = options[Math.floor(Math.random() * options.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    // Start 40-60 units behind the closest point so the car drives past the player.
    const pos = Math.max(0, Math.min(o.len, o.along - dir * (40 + Math.random() * 20)));
    const car = new Emitter(this, {
      x: 0, z: 0, y: 1,
      buffer: this.buffers.engine,
      bus: this.ambienceBus,
      gain: 0.35,
      refDistance: 5,
      rate: this.real?.traffic ? 1 : 0.8 + Math.random() * 0.5, // real recording plays at natural pitch
    });
    Object.assign(car, { road: o.r, pos, dir, speed: 10 + Math.random() * 8, honkIn: 0.5 + Math.random() * 2 });
    const k = pos / o.len;
    car.x = o.r.x1 + (o.r.x2 - o.r.x1) * k;
    car.z = o.r.z1 + (o.r.z2 - o.r.z1) * k;
    car.start();
    this.cars.push(car);
  }

  // light: 0 (night) .. 1 (day), from timer:tick timeOfDay.light. Crowds and
  // drums get livelier at night, music gets a little louder.
  setLight(light) {
    this.light = light;
    this.applyLevels();
  }

  // Random events from the server.
  onEvent(type, active) {
    if (active) this.events.add(type); else this.events.delete(type);
    if (!this.started) return;
    const t = this.ctx.currentTime;
    if (type === 'rain') this.rainGain.gain.setTargetAtTime(active ? 0.25 : 0, t, 0.8);
    if (active && (type === 'double-points' || type === 'dhaker-beat')) this.playSfx('shankh');
    this.applyLevels();
  }

  applyLevels() {
    if (!this.started) return;
    const night = 1 - this.light;
    const beat = this.events.has('dhaker-beat');
    const rain = this.events.has('rain');
    const dhakLevel = (0.8 + 0.4 * night) * (beat ? 1.6 : 1) * (rain ? 0.7 : 1);
    const crowdLevel = (0.7 + 0.6 * night) * (rain ? 0.5 : 1);
    this.dhaks.forEach((e) => e.setLevel(dhakLevel, beat ? 1.1 : 1));
    this.crowds.forEach((e) => e.setLevel(crowdLevel));
    this.musicBus.gain.setTargetAtTime(0.14 + 0.08 * night, this.ctx.currentTime, 1);
  }

  // name: 'discover' | 'first' | 'countdown' | 'go' | 'shankh' | 'end'
  playSfx(name) {
    if (!this.started) return;
    const b = this.buffers;
    const map = { discover: b.discover, first: b.first, countdown: b.beep, go: b.shankh, shankh: b.shankh, end: b.shankhLong, gheeOut: b.gheeOut };
    const buffer = map[name];
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (name === 'gheeOut') {
      // extra loud, straight to the master (skips the quieter effects channel)
      const boost = this.ctx.createGain();
      boost.gain.value = 1.6;
      src.connect(boost).connect(this.master);
    } else {
      src.connect(this.sfxBus);
    }
    src.start();
    if (name === 'go') this.oneShotFlat(b.beepHigh);
  }

  oneShotFlat(buffer) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.sfxBus);
    src.start();
  }

  // Volume controls for a settings menu. Values 0..1.
  setVolume({ master, music, ambience, sfx } = {}) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    if (master !== undefined) this.master.gain.setTargetAtTime(master, t, 0.05);
    if (music !== undefined) this.musicBus.gain.setTargetAtTime(music * 0.2, t, 0.05);
    if (ambience !== undefined) this.ambienceBus.gain.setTargetAtTime(ambience * 0.9, t, 0.05);
    if (sfx !== undefined) this.sfxBus.gain.setTargetAtTime(sfx * 0.7, t, 0.05);
  }

  setMuted(muted) {
    if (!this.started) return;
    if (muted) this.ctx.suspend(); else this.ctx.resume();
  }
}

if (typeof window !== 'undefined') window.PandalAudio = PandalAudio;
