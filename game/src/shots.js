// The staged screenshot scenes. Each one starts from a fresh world and steps the real rules forward
// with a scripted pair of hands: no frame is drawn from invented state. `cover` walks the Moth to
// the keycard desk and holds the room at its fullest; `near` baits a guard until the meter is at the
// near-miss notch and ducks behind the long desk; `alarm` stands in a torch until the floor wakes
// up; `title` is the title screen itself. Same name and seed always end on the same tick.

import { STEP, SCREEN } from './config.js';
import { loadLevel, stepWorld } from './world.js';

export const SHOT_NAMES = ['cover', 'near', 'alarm', 'title'];

const DUCK_AT_METER = 0.4;
const NEAR_MIN_METER = 0.7;

/** Walk a list of tile centres, a little at a time, as the keyboard would. */
function createWalk(points) {
  let index = 0;
  return {
    get done() {
      return index >= points.length;
    },
    input(world, crouch, pointer) {
      let dx = 0;
      let dy = 0;
      if (index < points.length) {
        const target = points[index];
        dx = target.x - world.player.x;
        dy = target.y - world.player.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 3.5) {
          index += 1;
          dx = 0;
          dy = 0;
        } else {
          dx /= distance;
          dy /= distance;
        }
      }
      return { dx, dy, crouch, throwAt: null, pointer };
    },
  };
}

function aimAtGuard(guard) {
  return { x: guard.x, y: guard.y, inside: true };
}

function settle(pointer, crouch = false) {
  return { dx: 0, dy: 0, crouch, throwAt: null, pointer };
}

/** The seed is a real input: it nudges each guard's first pause and sweep, then the rules take over. */
function seedGuards(world, seed) {
  for (const guard of world.guards) {
    guard.waitTimer += (seed - 1) * 0.07;
    guard.sweepPhase += (seed - 1) * 0.137;
  }
}

function finish(world, screen, pointer) {
  return {
    screen,
    ui: {
      time: world.time,
      pointer,
      bestTime: undefined,
      totals: undefined,
      seed: world.seed,
    },
  };
}

/**
 * Take the keycard, wait above the patrol row until the west torch has passed, then drop into the
 * lamp pool behind it. Hold until the second guard's torch climbs north: two cones, both in view.
 */
function stageCover(world) {
  loadLevel(world, 0);
  seedGuards(world, world.seed);
  const up = createWalk([
    { x: 620, y: 660 },
    { x: 620, y: 300 },
  ]);
  const down = createWalk([{ x: 620, y: 500 }]);
  const aim = { x: 200, y: 300, inside: true };
  let phase = 0;
  let ticks = 0;
  while (world.time < 17.4 && world.status === SCREEN.PLAY && ticks < 60 * 20) {
    let input;
    if (phase === 0) {
      input = up.input(world, false, aim);
      if (up.done) phase = 1;
    } else if (phase === 1) {
      input = settle(aim, true);
      if (world.time >= 14.35) phase = 2;
    } else if (phase === 2) {
      input = down.input(world, true, aim);
      if (down.done) phase = 3;
    } else {
      input = settle(aim, true);
    }
    stepWorld(world, input, STEP);
    ticks += 1;
  }
  return finish(world, SCREEN.PLAY, aim);
}

/**
 * Stand in the west corridor until the patrol's meter reaches the near-miss notch, then slip around
 * the long desk. Freeze on the first tick the desk cuts the line of sight while the meter is high.
 */
function stageNear(world) {
  loadLevel(world, 0);
  seedGuards(world, world.seed);
  const approach = createWalk([
    { x: 1100, y: 540 },
    { x: 260, y: 540 },
    { x: 260, y: 420 },
  ]);
  const duck = createWalk([
    { x: 180, y: 420 },
    { x: 180, y: 340 },
    { x: 260, y: 340 },
  ]);
  const guard = world.guards[0];
  let ducking = false;
  let frozen = false;
  let ticks = 0;
  let pointer = aimAtGuard(guard);
  while (world.time < 24 && world.status === SCREEN.PLAY && !frozen && ticks < 60 * 26) {
    pointer = aimAtGuard(guard);
    if (!ducking) {
      const input = approach.input(world, false, pointer);
      stepWorld(world, input, STEP);
      if (approach.done && guard.sees && guard.meter >= DUCK_AT_METER) ducking = true;
    } else {
      const input = duck.input(world, true, pointer);
      stepWorld(world, input, STEP);
      const covered = !guard.sees && guard.meter >= NEAR_MIN_METER;
      if (covered || (duck.done && !guard.sees)) frozen = true;
    }
    ticks += 1;
  }
  return finish(world, SCREEN.PLAY, pointer);
}

/**
 * Bait the west patrol into raising the alarm, then slip behind the long desk while every torch
 * turns red and hunts the last place the Moth was seen.
 */
function stageAlarm(world) {
  loadLevel(world, 0);
  seedGuards(world, world.seed);
  const approach = createWalk([
    { x: 1100, y: 540 },
    { x: 260, y: 540 },
    { x: 260, y: 420 },
  ]);
  const duck = createWalk([
    { x: 180, y: 420 },
    { x: 180, y: 340 },
    { x: 260, y: 340 },
  ]);
  const guard = world.guards[0];
  let ducking = false;
  let ticks = 0;
  let pointer = aimAtGuard(guard);
  while (world.time < 24 && world.status === SCREEN.PLAY && ticks < 60 * 26) {
    pointer = aimAtGuard(guard);
    if (world.alarm.raised) ducking = true;
    const input = ducking ? duck.input(world, true, pointer) : approach.done ? settle(pointer) : approach.input(world, false, pointer);
    stepWorld(world, input, STEP);
    ticks += 1;
    if (ducking && duck.done && !world.alarm.raised) break;
    if (ducking && duck.done && guard.distance < 150) break;
  }
  return finish(world, SCREEN.PLAY, pointer);
}

function stageTitle(world) {
  loadLevel(world, 0);
  seedGuards(world, world.seed);
  world.time = 4.2;
  return finish(world, SCREEN.TITLE, { x: 640, y: 360, inside: false });
}

/** Run one named scene against `world` (which is reset here). Returns the screen and HUD state. */
export function runShot(world, name, seed = 1) {
  const shot = SHOT_NAMES.includes(name) ? name : 'cover';
  world.seed = seed;
  let result;
  if (shot === 'title') result = stageTitle(world);
  else {
    if (shot === 'near') result = stageNear(world);
    else if (shot === 'alarm') result = stageAlarm(world);
    else result = stageCover(world);
  }
  return result;
}
