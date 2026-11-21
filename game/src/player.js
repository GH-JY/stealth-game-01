// The Moth: the player's body and the player's hands. Movement is quick and light on the feet,
// crouching halves the pace and most of the noise, and a left click throws a pebble at the point
// under the mouse. Keyboard and mouse are captured here; the world advances this body each tick.

import { VIEW, PLAYER, PEBBLE } from './config.js';
import { angleDelta, clamp, lerp, moveCircle } from './geometry.js';

export const ACTION = {
  CONFIRM: 1,
  RESTART: 2,
  BACK: 4,
};

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createPlayer(start) {
  return {
    x: start.x,
    y: start.y,
    vx: 0,
    vy: 0,
    facing: -Math.PI / 2,
    radius: PLAYER.radius,
    crouch: false,
    crouchAmount: 0,
    stepTimer: 0,
    throwCooldown: 0,
    moving: false,
    speed: 0,
    scarf: [],
    scarfTimer: 0,
  };
}

function emit(world, name, x, y, gain) {
  world.sounds.push({ name, x, y, gain });
  if (world.sounds.length > 64) world.sounds.shift();
}

function ring(world, kind, x, y, life, radius, color) {
  world.effects.push({ kind, x, y, age: 0, life, radius, color });
  if (world.effects.length > 80) world.effects.shift();
}

/** A pebble leaves the Moth's hand toward a point, to clatter wherever it lands. */
export function throwPebble(world, target) {
  const player = world.player;
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  world.pebbles.push({
    x: player.x + Math.cos(angle) * 14,
    y: player.y + Math.sin(angle) * 14,
    vx: Math.cos(angle) * PEBBLE.speed,
    vy: Math.sin(angle) * PEBBLE.speed,
    travelled: 14,
  });
  world.stats.pebblesThrown += 1;
}

/** Advance the body one fixed tick from a keyboard/mouse intent. */
export function updatePlayer(world, intent, dt) {
  const player = world.player;
  player.crouch = Boolean(intent.crouch);

  let dx = intent.dx ?? 0;
  let dy = intent.dy ?? 0;
  const length = Math.hypot(dx, dy);
  if (length > 1) {
    dx /= length;
    dy /= length;
  }

  const topSpeed = player.crouch ? PLAYER.crouchSpeed : PLAYER.walk;
  const rate = length > 0 ? PLAYER.acceleration : PLAYER.friction;
  const maxDelta = rate * dt;
  player.vx += clamp(dx * topSpeed - player.vx, -maxDelta, maxDelta);
  player.vy += clamp(dy * topSpeed - player.vy, -maxDelta, maxDelta);

  moveCircle(world.grid, player, player.vx * dt, player.vy * dt, player.radius);
  player.speed = Math.hypot(player.vx, player.vy);
  player.moving = player.speed > 14;

  const aim = intent.pointer;
  if (aim && aim.inside) {
    const wanted = Math.atan2(aim.y - player.y, aim.x - player.x);
    player.facing += angleDelta(player.facing, wanted) * Math.min(1, dt * 14);
  } else if (player.moving) {
    const wanted = Math.atan2(player.vy, player.vx);
    player.facing += angleDelta(player.facing, wanted) * Math.min(1, dt * 8);
  }

  player.crouchAmount = lerp(player.crouchAmount, player.crouch ? 1 : 0, Math.min(1, dt * 11));

  // Footfalls: a walk carries; a crouch is slow and almost silent.
  if (player.moving) {
    player.stepTimer -= dt;
    if (player.stepTimer <= 0) {
      player.stepTimer = player.crouch ? PLAYER.stepCrouch : PLAYER.stepWalk;
      const loudness = player.crouch ? PLAYER.stepQuiet : 1;
      emit(world, 'step', player.x, player.y, loudness);
      ring(
        world,
        'step',
        player.x,
        player.y + 4,
        0.42,
        player.crouch ? 12 : 19,
        player.crouch ? 'rgba(170,196,216,0.30)' : 'rgba(214,226,240,0.55)',
      );
    }
  } else {
    player.stepTimer = Math.min(player.stepTimer, 0.08);
  }

  player.scarfTimer -= dt;
  if (player.scarfTimer <= 0) {
    player.scarfTimer = 0.055;
    player.scarf.push({ x: player.x, y: player.y, angle: player.facing });
    if (player.scarf.length > PLAYER.scarfTrail) player.scarf.shift();
  }

  player.throwCooldown = Math.max(0, player.throwCooldown - dt);
  if (intent.throwAt && player.throwCooldown <= 0) {
    throwPebble(world, intent.throwAt);
    player.throwCooldown = PLAYER.throwCooldown;
    emit(world, 'throw', player.x, player.y, 0.35);
  }
}

/** Mouse and keyboard state, read once a frame; one-shot presses are cleared when read. */
export function createInput(canvas) {
  const held = new Set();
  const pointer = { x: VIEW.width * 0.66, y: VIEW.height * 0.52, inside: false };
  const actions = new Set();
  let throwAt = null;

  function toView(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW.width,
      y: ((event.clientY - rect.top) / rect.height) * VIEW.height,
    };
  }

  function keyDown(event) {
    const guardKeys = MOVE_KEYS[event.code] || event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight';
    if (guardKeys) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions.add(ACTION.CONFIRM);
    if (event.code === 'KeyR') actions.add(ACTION.RESTART);
    if (event.code === 'Escape') actions.add(ACTION.BACK);
  }

  function pointerMove(event) {
    const point = toView(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.inside = true;
  }

  function pointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = toView(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.inside = true;
    throwAt = point;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointerleave', () => {
    pointer.inside = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    pointer,
    /** Everything the next fixed tick needs from the player's hands. */
    read() {
      let dx = 0;
      let dy = 0;
      for (const [code, [mx, my]] of Object.entries(MOVE_KEYS)) {
        if (!held.has(code)) continue;
        dx += mx;
        dy += my;
      }
      const crouch = held.has('ShiftLeft') || held.has('ShiftRight');
      const throwTarget = throwAt;
      throwAt = null;
      return {
        dx: clamp(dx, -1, 1),
        dy: clamp(dy, -1, 1),
        crouch,
        throwAt: throwTarget,
        pointer: { x: pointer.x, y: pointer.y, inside: pointer.inside },
      };
    },
    /** One-shot keyboard actions, consumed here so a press is handled once. */
    takeActions() {
      let mask = 0;
      for (const action of actions) mask |= action;
      actions.clear();
      return mask;
    },
    /** Staging hook: aim and click from code exactly as the mouse would. */
    aimAt(x, y) {
      pointer.x = x;
      pointer.y = y;
      pointer.inside = true;
    },
    clickAt(x, y) {
      throwAt = { x, y };
    },
  };
}
