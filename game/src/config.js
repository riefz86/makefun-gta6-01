// Solmar Heat — shared constants and small helpers for the whole game.
// The city is a grid of avenues: roads every PITCH metres, blocks between them.
export const PITCH = 58; // distance between parallel road centrelines
export const ROAD_W = 14; // road surface width
export const GRID = 4; // roads run at i * PITCH for i in [-GRID .. GRID]
export const CITY_HALF = GRID * PITCH + PITCH / 2; // outer edge of the last block
export const BEACH_Z = CITY_HALF + 26; // sand strip starts here (south edge)
export const SEA_Z = BEACH_Z + 70; // ocean plane starts here

export const PLAYER_WALK_SPEED = 5.2;
export const PLAYER_RUN_SPEED = 9.0;
export const PLAYER_HEALTH_MAX = 100;

export const WANTED_MAX = 5;
export const SAVE_KEY = 'solmar-heat-save-v1';

// Deterministic RNG so screenshot scenes are reproducible from a seed.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Pastel sun-soaked palette for the procedural buildings.
export const BUILDING_COLORS = [
  0xf2e3c6, 0xe8b4a0, 0xf7d774, 0xa8d8c8, 0x9fc3e8,
  0xe8a0b4, 0xd8c8f0, 0xf0f0e8, 0xc8e0a8, 0xe8c890,
];
export const CAR_COLORS = [
  0xd23b2e, 0x2e6fd2, 0xe8c832, 0x2ed27a, 0xe8e8e8,
  0x222226, 0x8a5fd2, 0xd27a2e, 0x3aa8c8, 0xb8c8d8,
];
