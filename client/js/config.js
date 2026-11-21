// Shared client settings. Keep speeds in sync with server/src/config.js.

// Where the backend lives. Same origin locally / on Render; on Vercel, point at the Render URL.
// TODO: replace with the real Render URL once the backend is deployed.
export const RENDER_URL = 'https://vbc-game.onrender.com';
export const SERVER_URL = location.hostname.endsWith('vercel.app') ? RENDER_URL : '';

export const WORLD_HALF_SIZE = 160; // city spans -160..160 on X and Z
export const WALK_SPEED = 6;
export const SPRINT_SPEED = 11;
