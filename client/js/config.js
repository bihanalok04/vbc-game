// Shared client settings. Keep speeds in sync with server/src/config.js.

// The game and the server run on the same Render service (and on localhost in development),
// so the game always talks to the address it was loaded from.
export const SERVER_URL = '';

export const WORLD_HALF_SIZE = 160; // city spans -160..160 on X and Z
export const WALK_SPEED = 8;
export const SPRINT_SPEED = 14;
