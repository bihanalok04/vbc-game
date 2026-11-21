// Random events that can happen during a round.
//
// The server decides when an event starts and ends and tells every player.
// `effects` are applied by both sides:
//   - pointsMultiplier: applied by the server when scoring
//   - speedMultiplier: applied by the frontend to movement speed, and by the
//     server when checking that movement is not impossibly fast

const EVENT_TYPES = [
  {
    type: 'double-points',
    name: 'Dhunuchi Dance!',
    description: 'Every pandal is worth double points for 20 seconds.',
    durationMs: 20 * 1000,
    effects: { pointsMultiplier: 2, speedMultiplier: 1 },
  },
  {
    type: 'dhaker-beat',
    name: "Dhaker Beat",
    description: 'The dhak drums pump everyone up: move 30% faster for 15 seconds.',
    durationMs: 15 * 1000,
    effects: { pointsMultiplier: 1, speedMultiplier: 1.3 },
  },
  {
    type: 'rain',
    name: 'Sudden Rain',
    description: 'Puja rain! Everyone slows down for 15 seconds.',
    durationMs: 15 * 1000,
    effects: { pointsMultiplier: 1, speedMultiplier: 0.7 },
  },
  {
    type: 'ghetto-spotlight',
    name: 'Para Gossip',
    description: 'Someone spilled the location of a hidden ghetto pandal.',
    durationMs: 15 * 1000,
    effects: { pointsMultiplier: 1, speedMultiplier: 1 },
    // Filled in when the event starts: { pandalId } of a ghetto pandal.
    needsGhettoPandal: true,
  },
];

const NO_EFFECTS = { pointsMultiplier: 1, speedMultiplier: 1 };

function pickRandomEventType() {
  return EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
}

module.exports = { EVENT_TYPES, NO_EFFECTS, pickRandomEventType };
