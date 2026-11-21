// The guards and their perception. Each guard walks a loop of waypoints, pausing to sweep a torch
// across the room, and sees through a cone that walls, crates and desks cut short. A sound sends
// the nearest one to look; a raised alarm sends them all after the Moth's last known place. They
// navigate the tile map by breadth-first search, so a crate in the way is walked around, not into.

import { GUARD, PEBBLE, TILE } from './config.js';
import {
  angleDelta,
  clamp,
  hasLineOfSight,
  isShadowAt,
  isSolidTile,
  moveCircle,
  tileCentre,
} from './geometry.js';

const NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function createGuards(level, built) {
  return level.routes.map((route, index) => {
    const points = route.map(([tx, ty]) => tileCentre(tx, ty));
    const first = points[0];
    const second = points[1 % points.length];
    return {
      id: index,
      route: points,
      x: first.x,
      y: first.y,
      facing: Math.atan2(second.y - first.y, second.x - first.x),
      state: 'patrol',
      leg: 1 % points.length,
      waitTimer: 0.4 + index * 0.25,
      baseFacing: Math.atan2(second.y - first.y, second.x - first.x),
      sweepPhase: index * 1.7,
      meter: 0,
      nearMissed: false,
      flash: 0,
      sees: false,
      seenBefore: false,
      distance: 999,
      sightRange: GUARD.range.patrol,
      target: null,
      lastKnown: null,
      searchTimer: 0,
      path: null,
      pathIndex: 0,
      destKey: '',
      repathTimer: 0,
      stepTimer: index * 0.19,
      stuck: 0,
    };
  });
}

function emit(world, name, x, y, gain) {
  world.sounds.push({ name, x, y, gain });
  if (world.sounds.length > 64) world.sounds.shift();
}

function mark(world, kind, x, y, life, radius, color) {
  world.effects.push({ kind, x, y, age: 0, life, radius, color });
  if (world.effects.length > 80) world.effects.shift();
}

function turnToward(guard, angle, dt, rate = GUARD.turnRate) {
  const delta = angleDelta(guard.facing, angle);
  guard.facing += clamp(delta, -rate * dt, rate * dt);
}

/** Breadth-first walk over walkable tiles, eight ways, never through a corner. */
function findTilePath(grid, start, goal) {
  const cols = grid.cols;
  const rows = grid.rows;
  const startTx = Math.floor(start.x / TILE);
  const startTy = Math.floor(start.y / TILE);
  const goalTx = Math.floor(goal.x / TILE);
  const goalTy = Math.floor(goal.y / TILE);
  if (startTx === goalTx && startTy === goalTy) return [tileCentre(goalTx, goalTy)];
  const startIndex = startTy * cols + startTx;
  const goalIndex = goalTy * cols + goalTx;
  const parent = new Int32Array(cols * rows).fill(-1);
  const seen = new Uint8Array(cols * rows);
  const queue = [startIndex];
  seen[startIndex] = 1;
  let head = 0;
  let found = false;
  while (head < queue.length && !found) {
    const index = queue[head];
    head += 1;
    const tx = index % cols;
    const ty = (index - tx) / cols;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (isSolidTile(grid, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (isSolidTile(grid, tx + dx, ty) || isSolidTile(grid, tx, ty + dy))) continue;
      const nextIndex = ny * cols + nx;
      if (seen[nextIndex]) continue;
      seen[nextIndex] = 1;
      parent[nextIndex] = index;
      if (nextIndex === goalIndex) {
        found = true;
        break;
      }
      queue.push(nextIndex);
    }
  }
  if (!found) return null;
  const tiles = [];
  for (let index = goalIndex; index !== startIndex && index !== -1; index = parent[index]) {
    const tx = index % cols;
    const ty = (index - tx) / cols;
    tiles.push(tileCentre(tx, ty));
  }
  tiles.reverse();
  return tiles.length > 0 ? tiles : [tileCentre(goalTx, goalTy)];
}

/** Pull the tile path taut so a guard walks a long diagonal instead of a staircase. */
function pullTaut(grid, from, points) {
  const out = [];
  let anchor = from;
  let index = 0;
  while (index < points.length) {
    let best = index;
    for (let probe = points.length - 1; probe > index; probe -= 1) {
      if (hasLineOfSight(grid, anchor.x, anchor.y, points[probe].x, points[probe].y)) {
        best = probe;
        break;
      }
    }
    out.push(points[best]);
    anchor = points[best];
    index = best + 1;
  }
  return out;
}

function setDestination(world, guard, point, key) {
  if (guard.destKey === key && guard.path) return;
  const tiles = findTilePath(world.grid, guard, point);
  guard.path = tiles ? pullTaut(world.grid, guard, tiles) : [{ x: point.x, y: point.y }];
  guard.pathIndex = 0;
  guard.destKey = key;
}

/** Walk the current path; true when the guard has arrived. */
function followPath(world, guard, speed, dt) {
  if (!guard.path) return true;
  while (guard.pathIndex < guard.path.length) {
    const node = guard.path[guard.pathIndex];
    const dx = node.x - guard.x;
    const dy = node.y - guard.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 7) {
      guard.pathIndex += 1;
      continue;
    }
    const angle = Math.atan2(dy, dx);
    turnToward(guard, angle, dt);
    const beforeX = guard.x;
    const beforeY = guard.y;
    moveCircle(world.grid, guard, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt, GUARD.radius);
    const moved = Math.hypot(guard.x - beforeX, guard.y - beforeY);
    if (moved < speed * dt * 0.25) {
      guard.stuck += dt;
      if (guard.stuck > 0.55) {
        guard.stuck = 0;
        guard.path = null;
        guard.destKey = '';
      }
    } else {
      guard.stuck = 0;
    }
    return false;
  }
  return true;
}

function sweep(guard, dt) {
  guard.sweepPhase += GUARD.sweepRate * dt;
  guard.facing = guard.baseFacing + Math.sin(guard.sweepPhase) * GUARD.sweepArc * 0.5;
}

function updatePatrol(world, guard, dt) {
  if (guard.waitTimer > 0) {
    guard.waitTimer -= dt;
    sweep(guard, dt);
    return;
  }
  const waypoint = guard.route[guard.leg];
  setDestination(world, guard, waypoint, `route:${guard.leg}`);
  if (followPath(world, guard, GUARD.patrolSpeed, dt)) {
    guard.waitTimer = GUARD.pauseAtWaypoint;
    guard.baseFacing = guard.facing;
    guard.sweepPhase = 0;
    guard.leg = (guard.leg + 1) % guard.route.length;
    guard.path = null;
    guard.destKey = '';
  }
}

function updateSuspicious(world, guard, dt) {
  const player = world.player;
  if (guard.sees) {
    guard.target = { x: player.x, y: player.y };
    guard.searchTimer = GUARD.investigateLook;
  }
  const target = guard.target ?? guard.lastKnown;
  if (!target) {
    toPatrol(guard);
    return;
  }
  const distance = Math.hypot(target.x - guard.x, target.y - guard.y);
  if (distance > 16) {
    guard.repathTimer -= dt;
    setDestination(world, guard, target, guard.sees ? 'chase' : `look:${Math.round(target.x)},${Math.round(target.y)}`);
    if (guard.sees && guard.repathTimer <= 0) {
      guard.repathTimer = 0.45;
      guard.path = null;
      guard.destKey = '';
    }
    followPath(world, guard, GUARD.suspiciousSpeed, dt);
    return;
  }
  guard.baseFacing = Math.atan2(target.y - guard.y, target.x - guard.x);
  sweep(guard, dt);
  guard.searchTimer -= dt;
  if (guard.searchTimer <= 0 && !guard.sees) toPatrol(guard);
}

function updateAlert(world, guard, dt) {
  const player = world.player;
  if (guard.sees) {
    guard.lastKnown = { x: player.x, y: player.y };
    guard.searchTimer = GUARD.alertSearch;
  }
  const target = guard.lastKnown;
  if (!target) return;
  const distance = Math.hypot(target.x - guard.x, target.y - guard.y);
  if (distance > 18) {
    setDestination(world, guard, target, guard.sees ? 'alert:chase' : 'alert:last');
    followPath(world, guard, GUARD.alertSpeed, dt);
    return;
  }
  guard.baseFacing = Math.atan2(target.y - guard.y, target.x - guard.x);
  sweep(guard, dt);
}

function toPatrol(guard) {
  guard.state = 'patrol';
  guard.target = null;
  guard.lastKnown = null;
  guard.searchTimer = 0;
  guard.path = null;
  guard.destKey = '';
  guard.waitTimer = 0.3;
  guard.baseFacing = guard.facing;
  guard.sweepPhase = 0;
}

/** What a guard can see this tick, and what seeing it does to its posture. */
function perceive(world, guard) {
  const player = world.player;
  const eyeX = guard.x + Math.cos(guard.facing) * 9;
  const eyeY = guard.y + Math.sin(guard.facing) * 9;
  const dx = player.x - eyeX;
  const dy = player.y - eyeY;
  const distance = Math.hypot(dx, dy);
  let range = GUARD.range[guard.state];
  if (player.crouch) range *= GUARD.crouchRange;
  if (isShadowAt(world.grid, player.x, player.y)) range *= GUARD.shadowRange;
  const halfAngle = GUARD.halfAngle[guard.state];
  const offset = Math.abs(angleDelta(guard.facing, Math.atan2(dy, dx)));
  const inCone = distance <= range && offset <= halfAngle;
  guard.sightRange = range;
  guard.distance = distance;
  guard.sees = inCone && hasLineOfSight(world.grid, eyeX, eyeY, player.x, player.y);

  if (guard.sees) {
    guard.lastKnown = { x: player.x, y: player.y };
    if (guard.state === 'patrol') {
      guard.state = 'suspicious';
      guard.target = { x: player.x, y: player.y };
      guard.searchTimer = GUARD.investigateLook;
      guard.path = null;
      guard.destKey = '';
    }
    if (guard.state === 'suspicious') {
      guard.target = { x: player.x, y: player.y };
      guard.searchTimer = GUARD.investigateLook;
    }
  }

  if (guard.sees && !guard.seenBefore) {
    guard.flash = Math.max(guard.flash, 0.45);
    emit(world, 'spotted', guard.x, guard.y, 0.55);
    mark(world, 'alert', guard.x, guard.y - 26, 0.9, 22, '#ffb457');
  }
  guard.seenBefore = guard.sees;
}

/** Advance every guard: posture, feet, eyes, torch sweep. */
export function updateGuards(world, dt) {
  for (const guard of world.guards) {
    guard.flash = Math.max(0, guard.flash - dt * 1.8);
    const beforeX = guard.x;
    const beforeY = guard.y;

    if (guard.state === 'alert') updateAlert(world, guard, dt);
    else if (guard.state === 'suspicious') updateSuspicious(world, guard, dt);
    else updatePatrol(world, guard, dt);

    const moved = Math.hypot(guard.x - beforeX, guard.y - beforeY);
    if (moved > 0.4) {
      guard.stepTimer -= dt;
      if (guard.stepTimer <= 0) {
        guard.stepTimer = GUARD.stepInterval;
        emit(world, 'guard-step', guard.x, guard.y, guard.state === 'alert' ? 0.85 : 0.6);
        mark(world, 'step', guard.x, guard.y + 4, 0.34, 11, 'rgba(255,196,120,0.28)');
      }
    }
    perceive(world, guard);
  }
}

/**
 * A clatter: the nearest guard that is not already alarmed walks over to look at it. Returns
 * whether anyone heard.
 */
export function hearNoise(world, x, y) {
  let listener = null;
  let closest = Infinity;
  for (const guard of world.guards) {
    if (guard.state === 'alert') continue;
    const distance = Math.hypot(guard.x - x, guard.y - y);
    if (distance <= PEBBLE.noiseRadius && distance < closest) {
      closest = distance;
      listener = guard;
    }
  }
  if (!listener) return false;
  listener.state = 'suspicious';
  listener.target = { x, y };
  listener.searchTimer = GUARD.investigateLook;
  listener.path = null;
  listener.destKey = '';
  listener.waitTimer = 0;
  listener.meter = Math.max(listener.meter, 0.12);
  listener.flash = Math.max(listener.flash, 0.3);
  emit(world, 'heard', listener.x, listener.y, 0.55);
  mark(world, 'question', listener.x, listener.y - 28, 1.35, 20, '#ffd166');
  return true;
}

/** The cone a guard's torch casts this tick: longer and wider with its alarm. */
export function coneShape(guard) {
  return {
    range: GUARD.range[guard.state],
    halfAngle: GUARD.halfAngle[guard.state],
  };
}
