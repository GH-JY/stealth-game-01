// The world and its fixed step: one level loaded from levels.js, the player, the guards, the
// pebbles, the keycard and the exit, advanced by exactly 1/60 s per tick whatever the frame rate.
// Everything that happens is recorded as a notice (for the screens), a sound (for the audio) or an
// effect (for the renderer), so no other module has to reach into the simulation to know what just
// happened.

import { STEP, PLAYER, PEBBLE, EXIT, GUARD, SCREEN, TILE } from './config.js';
import { LEVELS } from './levels.js';
import { KIND, buildGrid, isShadowAt } from './geometry.js';
import { createPlayer, updatePlayer } from './player.js';
import { createGuards, updateGuards, hearNoise } from './guards.js';
import { updateDetection, updateAlarm } from './alarm.js';

/** Notices a run can raise; the page listens for the ones that change the screen. */
export const NOTICE = {
  NEAR_MISS: 'near-miss',
  ALARM: 'alarm',
  ALARM_END: 'alarm-end',
  KEYCARD: 'keycard',
  EXIT_LOCKED: 'exit-locked',
  CLEAR: 'clear',
  CAUGHT: 'caught',
  GUARD_ALERT: 'guard-alert',
  PEBBLE: 'pebble',
};

export function createWorld() {
  return {
    levels: LEVELS,
    levelIndex: 0,
    level: null,
    grid: null,
    player: null,
    guards: [],
    keycard: { x: 0, y: 0, taken: false },
    exit: { x: 0, y: 0, open: false },
    pebbles: [],
    effects: [],
    sounds: [],
    notices: [],
    alarm: { raised: false, timer: 0, flash: 0 },
    detection: 0,
    nearMissPulse: 0,
    time: 0,
    seed: 1,
    status: SCREEN.PLAY,
    caughtReason: '',
    stats: { elapsed: 0, nearMisses: 0, pebblesThrown: 0, alarms: 0 },
    exitNudge: 0,
    alarmNudge: 0,
  };
}

/** Load a night fresh: parse its map, put the Moth at the door, set the guards on their loops. */
export function loadLevel(world, index) {
  const level = world.levels[index];
  const built = buildGrid(level);
  world.levelIndex = index;
  world.level = level;
  world.grid = { tiles: built.tiles, cols: built.cols, rows: built.rows };
  world.player = createPlayer(built.start);
  world.guards = createGuards(level, built);
  world.keycard = { x: built.keycard.x, y: built.keycard.y, taken: false };
  world.exit = { x: built.exit.x, y: built.exit.y, open: false };
  world.pebbles = [];
  world.effects = [];
  world.sounds = [];
  world.notices = [];
  world.alarm = { raised: false, timer: 0, flash: 0 };
  world.detection = 0;
  world.nearMissPulse = 0;
  world.time = 0;
  world.status = SCREEN.PLAY;
  world.caughtReason = '';
  world.stats = { elapsed: 0, nearMisses: 0, pebblesThrown: 0, alarms: 0 };
  world.exitNudge = 0;
  return world;
}

export function restartLevel(world) {
  loadLevel(world, world.levelIndex);
}

/** One fixed tick of the real rules. Returns the world for chaining in tests. */
export function stepWorld(world, intent, dt = STEP) {
  if (world.status !== SCREEN.PLAY) return world;
  world.time += dt;
  world.stats.elapsed += dt;

  updatePlayer(world, intent, dt);
  updateGuards(world, dt);
  updateDetection(world, dt);
  updateAlarm(world, dt);
  updatePebbles(world, dt);
  updateEffects(world, dt);
  checkTouched(world);
  checkGoals(world);

  world.alarm.flash = Math.max(0, world.alarm.flash - dt * 1.6);
  world.exitNudge = Math.max(0, world.exitNudge - dt);
  return world;
}

function checkGoals(world) {
  const player = world.player;
  if (!world.keycard.taken) {
    const reach = Math.hypot(player.x - world.keycard.x, player.y - world.keycard.y);
    if (reach < PLAYER.pickupReach) {
      world.keycard.taken = true;
      world.exit.open = true;
      pushNotice(world, NOTICE.KEYCARD);
      pushSound(world, 'keycard', world.keycard.x, world.keycard.y, 0.9);
      pushEffect(world, 'pickup', world.keycard.x, world.keycard.y, { life: 0.9, radius: 52, color: '#ffd166' });
    }
  }
  const exitReach = Math.hypot(player.x - world.exit.x, player.y - world.exit.y);
  if (exitReach < EXIT.reach) {
    if (world.keycard.taken) {
      world.status = SCREEN.CLEAR;
      pushNotice(world, NOTICE.CLEAR);
      pushSound(world, 'clear', world.exit.x, world.exit.y, 1);
      pushEffect(world, 'exit', world.exit.x, world.exit.y, { life: 1.1, radius: 70, color: '#54e6a6' });
    } else if (world.exitNudge <= 0) {
      world.exitNudge = 2.4;
      pushNotice(world, NOTICE.EXIT_LOCKED);
      pushSound(world, 'locked', world.exit.x, world.exit.y, 0.8);
      pushEffect(world, 'locked', world.exit.x, world.exit.y, { life: 0.6, radius: 30, color: '#ff7d70' });
    }
  }
}

function checkTouched(world) {
  const player = world.player;
  for (let index = 0; index < world.guards.length; index += 1) {
    const guard = world.guards[index];
    const distance = Math.hypot(player.x - guard.x, player.y - guard.y);
    if (distance < PLAYER.radius + GUARD.radius + GUARD.touchReach) {
      world.status = SCREEN.CAUGHT;
      world.caughtReason =
        guard.state === 'alert'
          ? 'A guard caught you in the alarm.'
          : guard.state === 'suspicious'
            ? 'A guard found you where you should not have been.'
            : 'A guard walked straight into you.';
      pushNotice(world, NOTICE.CAUGHT);
      pushSound(world, 'caught', player.x, player.y, 1);
      return;
    }
  }
}

function updatePebbles(world, dt) {
  for (let index = world.pebbles.length - 1; index >= 0; index -= 1) {
    const pebble = world.pebbles[index];
    let landed = false;
    const stepDistance = Math.hypot(pebble.vx, pebble.vy) * dt;
    const slices = Math.max(1, Math.ceil(stepDistance / 4));
    for (let slice = 0; slice < slices && !landed; slice += 1) {
      const nx = pebble.x + (pebble.vx * dt) / slices;
      const ny = pebble.y + (pebble.vy * dt) / slices;
      pebble.travelled += stepDistance / slices;
      if (!lineWalkable(world.grid, pebble.x, pebble.y, nx, ny)) landed = true;
      else {
        pebble.x = nx;
        pebble.y = ny;
        if (pebble.travelled >= PEBBLE.maxRange) landed = true;
      }
    }
    if (landed) {
      world.pebbles.splice(index, 1);
      clatter(world, pebble.x, pebble.y);
    }
  }
}

function lineWalkable(grid, x0, y0, x1, y1) {
  // A pebble is small: it stops on the tile it would enter, not on the pixel it grazes.
  const tx = Math.floor(x1 / TILE);
  const ty = Math.floor(y1 / TILE);
  const currentTx = Math.floor(x0 / TILE);
  const currentTy = Math.floor(y0 / TILE);
  if (tx === currentTx && ty === currentTy) return true;
  const kind = grid.tiles[ty * grid.cols + tx];
  const solid = kind === KIND.WALL || kind === KIND.CRATE || kind === KIND.DESK || kind === KIND.KEYCARD;
  return !solid;
}

function clatter(world, x, y) {
  pushEffect(world, 'clatter', x, y, { life: PEBBLE.clatterLife, radius: PEBBLE.noiseRadius * 0.55, color: '#f4d9a6' });
  pushSound(world, 'pebble', x, y, 1);
  pushNotice(world, NOTICE.PEBBLE);
  const heard = hearNoise(world, x, y);
  if (heard) pushNotice(world, NOTICE.GUARD_ALERT);
}

function updateEffects(world, dt) {
  for (let index = world.effects.length - 1; index >= 0; index -= 1) {
    const effect = world.effects[index];
    effect.age += dt;
    if (effect.age >= effect.life) world.effects.splice(index, 1);
  }
}

export function pushNotice(world, notice) {
  world.notices.push(notice);
  if (world.notices.length > 24) world.notices.shift();
}

export function pushSound(world, name, x, y, gain = 1) {
  world.sounds.push({ name, x, y, gain });
  if (world.sounds.length > 64) world.sounds.shift();
}

export function pushEffect(world, kind, x, y, options = {}) {
  world.effects.push({
    kind,
    x,
    y,
    age: 0,
    life: options.life ?? 0.6,
    radius: options.radius ?? 40,
    color: options.color ?? '#ffffff',
  });
  if (world.effects.length > 80) world.effects.shift();
}

/** Whether a point on the floor is in shadow, for the HUD's quiet indicator. */
export function playerInShadow(world) {
  return isShadowAt(world.grid, world.player.x, world.player.y);
}

/** Whether the Moth currently stands in any guard's cone; used for the HUD's "watched" state. */
export function playerSeen(world) {
  return world.guards.some((guard) => guard.sees);
}
