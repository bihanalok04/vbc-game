// Shared day/night clock. The server sends this to everyone once a second so all
// players see the same sky. The frontend uses `light` (0 = darkest night,
// 1 = full daylight) to set sun brightness, sky colour, street lights, etc.

const { DAY_CYCLE } = require('./config');

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const NIGHT_LIGHT = 0.15;

// progress: 0 at the start of the round, 1 at the end.
function timeOfDay(progress) {
  const p = Math.min(1, Math.max(0, progress));
  const hour = DAY_CYCLE.startHour + (DAY_CYCLE.endHour - DAY_CYCLE.startHour) * p; // may go past 24

  // Day until 17:30, dusk until 19:00, night until 04:30, dawn until 06:00.
  const dusk = smoothstep(17.5, 19, hour); // 0 -> 1 as it gets dark
  const dawn = smoothstep(28.5, 30, hour); // 0 -> 1 as it gets light again
  const light = 1 - (1 - NIGHT_LIGHT) * dusk + (1 - NIGHT_LIGHT) * dawn;

  let phase = 'day';
  if (hour >= 17.5 && hour < 19) phase = 'dusk';
  else if (hour >= 19 && hour < 28.5) phase = 'night';
  else if (hour >= 28.5) phase = 'dawn';

  const h24 = hour % 24;
  const hh = Math.floor(h24);
  const mm = Math.floor((h24 - hh) * 60);
  const clock = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;

  return { hour: Number(h24.toFixed(3)), light: Number(light.toFixed(3)), phase, clock };
}

module.exports = { timeOfDay };
