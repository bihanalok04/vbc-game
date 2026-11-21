// All game tuning numbers live here so the whole team can find and change them.

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  // Allowed origins for cross-site requests. The game is served from this same
  // server on Render, so the default "*" is fine.
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || '*',

  // Game modes. Solo rooms are private (nobody can join them).
  MODES: {
    solo: { minPlayers: 1, maxPlayers: 1 },
    multiplayer: { minPlayers: 2, maxPlayers: 8 },
  },
  ROOM_CODE_LENGTH: 5,
  MAX_NAME_LENGTH: 16,

  // Round length: the player (or the host in multiplayer) picks one of these.
  ROUND_DURATION_OPTIONS_SEC: [120, 150, 180],
  DEFAULT_ROUND_DURATION_SEC: 150,

  // Day/night: each round runs the in-game clock from START_HOUR to END_HOUR,
  // so players see afternoon -> dusk -> Puja night -> dawn. 30 = 6 AM next day.
  DAY_CYCLE: { startHour: 16, endHour: 30 },
  COUNTDOWN_MS: 3 * 1000, // "3, 2, 1, go" before the round starts
  SNAPSHOT_RATE_HZ: 15, // how often player positions are broadcast

  // Scoring
  POINTS: {
    regular: 3,
    ghetto: 5,
    firstDiscoveryBonus: 2,
  },

  // A player must be this close (in world units) to a pandal to discover it.
  DISCOVERY_RADIUS: 8,

  // Movement limits, used to reject obviously impossible movement.
  // Keep these in sync with the frontend's movement code (Member 2).
  WALK_SPEED: 8,
  SPRINT_SPEED: 14,
  SPEED_TOLERANCE: 1.6, // allow some slack for lag and frame-rate jitter
  WORLD_HALF_SIZE: 160, // the city spans -160..160 on X and Z

  // Random events
  EVENT_FIRST_DELAY_MS: 30 * 1000,
  EVENT_MIN_GAP_MS: 25 * 1000,
  EVENT_MAX_GAP_MS: 45 * 1000,
};
