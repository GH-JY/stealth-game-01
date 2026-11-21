// The level as geometry: tile kinds, what blocks feet and what blocks eyes, circles sliding along
// walls, and the line-of-sight test every guard's cone is built on. Pure functions over a tile grid,
// so the world, the guards and the renderer all agree on where a wall is.

import { TILE, COLS, ROWS } from './config.js';

export const KIND = {
  FLOOR: 0,
  WALL: 1,
  CRATE: 2,
  DESK: 3,
  KEYCARD: 4,
  SHADOW: 5,
  EXIT: 6,
};

const FROM_CHAR = {
  '.': KIND.FLOOR,
  '#': KIND.WALL,
  'c': KIND.CRATE,
  'd': KIND.DESK,
  'K': KIND.KEYCARD,
  's': KIND.SHADOW,
  'E': KIND.EXIT,
  'P': KIND.FLOOR,
};

const SOLID = new Set([KIND.WALL, KIND.CRATE, KIND.DESK, KIND.KEYCARD]);
const SIGHT_BLOCKING = SOLID;

/** Tile world coordinates for the centre of a tile. */
export function tileCentre(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

/** Tile index holding a world point. */
export function tileOf(x, y) {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

/**
 * Read a level definition's ASCII map into tiles plus the three places that matter: where the Moth
 * starts, where the exit is, and which desk the keycard lies on.
 */
export function buildGrid(definition) {
  const rows = definition.grid.trim().split('\n');
  if (rows.length !== ROWS) throw new Error(`${definition.key}: expected ${ROWS} rows, got ${rows.length}`);
  const tiles = new Uint8Array(COLS * ROWS);
  let start = null;
  let exit = null;
  let keycard = null;
  rows.forEach((row, ty) => {
    if (row.length !== COLS) throw new Error(`${definition.key}: row ${ty} is ${row.length} tiles, not ${COLS}`);
    [...row].forEach((char, tx) => {
      const kind = FROM_CHAR[char];
      if (kind === undefined) throw new Error(`${definition.key}: unknown tile "${char}" at ${tx},${ty}`);
      tiles[ty * COLS + tx] = kind;
      if (char === 'P') start = tileCentre(tx, ty);
      else if (char === 'E') exit = tileCentre(tx, ty);
      else if (char === 'K') keycard = tileCentre(tx, ty);
    });
  });
  if (!start || !exit || !keycard) throw new Error(`${definition.key}: needs a P, an E and a K tile`);
  return { tiles, cols: COLS, rows: ROWS, start, exit, keycard };
}

export function kindAt(grid, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) return KIND.WALL;
  return grid.tiles[ty * grid.cols + tx];
}

export function isSolidKind(kind) {
  return SOLID.has(kind);
}

export function isSolidTile(grid, tx, ty) {
  return SOLID.has(kindAt(grid, tx, ty));
}

export function blocksSight(grid, tx, ty) {
  return SIGHT_BLOCKING.has(kindAt(grid, tx, ty));
}

export function isShadowTile(grid, tx, ty) {
  return kindAt(grid, tx, ty) === KIND.SHADOW;
}

/** Whether the floor under a world point is in shadow (the Moth is harder to see there). */
export function isShadowAt(grid, x, y) {
  const { tx, ty } = tileOf(x, y);
  return isShadowTile(grid, tx, ty);
}

/** A circle overlaps a solid tile: exact closest-point test on every tile it touches. */
export function circleHitsSolid(grid, x, y, radius) {
  const minX = Math.floor((x - radius) / TILE);
  const maxX = Math.floor((x + radius) / TILE);
  const minY = Math.floor((y - radius) / TILE);
  const maxY = Math.floor((y + radius) / TILE);
  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      if (!isSolidTile(grid, tx, ty)) continue;
      const left = tx * TILE;
      const top = ty * TILE;
      const nearestX = Math.max(left, Math.min(x, left + TILE));
      const nearestY = Math.max(top, Math.min(y, top + TILE));
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
  }
  return false;
}

/**
 * Slide a circle by (dx, dy), one axis at a time in small steps, so it never tunnels through a
 * crate at speed and rubs along walls instead of sticking to them. Mutates and returns the body.
 */
export function moveCircle(grid, body, dx, dy, radius) {
  const step = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const slices = Math.ceil(step / 3);
  const sx = dx / slices;
  const sy = dy / slices;
  for (let slice = 0; slice < slices; slice += 1) {
    if (!circleHitsSolid(grid, body.x + sx, body.y, radius)) body.x += sx;
    if (!circleHitsSolid(grid, body.x, body.y + sy, radius)) body.y += sy;
  }
  return body;
}

/** Whether a straight line is free of solid tiles, sampled finely enough for 40 px tiles. */
export function walkLineClear(grid, x0, y0, x1, y1) {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(distance / 5));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const { tx, ty } = tileOf(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    if (isSolidTile(grid, tx, ty)) return false;
  }
  return true;
}

/** Whether a straight line is free of anything that blocks sight: walls, crates and desks. */
export function hasLineOfSight(grid, x0, y0, x1, y1) {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(distance / 5));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const { tx, ty } = tileOf(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    if (blocksSight(grid, tx, ty)) return false;
  }
  return true;
}

/** How far a ray travels before a wall, crate or desk stops it, up to `reach`. */
export function rayReach(grid, x0, y0, angle, reach) {
  const stepX = Math.cos(angle);
  const stepY = Math.sin(angle);
  for (let travelled = 6; travelled < reach; travelled += 7) {
    const { tx, ty } = tileOf(x0 + stepX * travelled, y0 + stepY * travelled);
    if (blocksSight(grid, tx, ty)) return travelled - 7;
  }
  return reach;
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(from, to, t) {
  return from + (to - from) * t;
}

/** The shortest signed angle from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a, b) {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
