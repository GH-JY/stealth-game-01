// Detection and the alarm. Every guard's torch fills a private meter while the Moth stands in its
// light; the meter drains when the line of sight breaks. A meter nearly full flashes the cone and
// sounds a sting (the near miss); a full one raises every guard. The alarm holds only while the
// Moth is being seen: break sight, stay hidden for a few seconds, and the floor goes quiet again.

import { DETECTION, ALARM, GUARD } from './config.js';
import { isShadowAt } from './geometry.js';

function emit(world, name, x, y, gain) {
  world.sounds.push({ name, x, y, gain });
  if (world.sounds.length > 64) world.sounds.shift();
}

function mark(world, kind, x, y, life, radius, color) {
  world.effects.push({ kind, x, y, age: 0, life, radius, color });
  if (world.effects.length > 80) world.effects.shift();
}

/** Fill each guard's meter from what it can see, and drain the ones that cannot. */
export function updateDetection(world, dt) {
  const player = world.player;
  const shadowed = isShadowAt(world.grid, player.x, player.y);
  let highest = 0;

  for (const guard of world.guards) {
    if (world.alarm.raised) {
      guard.meter = guard.sees ? 1 : Math.max(0, guard.meter - DETECTION.alertDrain * dt);
      highest = Math.max(highest, guard.meter);
      continue;
    }

    if (guard.sees) {
      const span = Math.max(1, guard.sightRange);
      const proximity = Math.max(0, Math.min(1, 1 - guard.distance / span));
      let rate = DETECTION.fill * (1 - DETECTION.closeBias + DETECTION.closeBias * proximity);
      if (player.crouch) rate *= GUARD.crouchMeter;
      if (shadowed) rate *= GUARD.shadowMeter;
      if (guard.state === 'suspicious') rate *= DETECTION.suspiciousBoost;
      guard.meter = Math.min(1, guard.meter + rate * dt);

      if (!guard.nearMissed && guard.meter >= DETECTION.nearMiss) {
        guard.nearMissed = true;
        guard.flash = Math.max(guard.flash, DETECTION.flashTime);
        world.nearMissPulse = 1;
        world.stats.nearMisses += 1;
        world.notices.push('near-miss');
        emit(world, 'nearMiss', player.x, player.y, 0.9);
        mark(world, 'near', guard.x, guard.y - 24, 0.8, 30, '#ffb457');
      }
      if (guard.meter >= 1) raiseAlarm(world);
    } else {
      const drain = DETECTION.drain * (guard.state === 'suspicious' ? 0.75 : 1);
      guard.meter = Math.max(0, guard.meter - drain * dt);
      if (guard.meter <= DETECTION.nearMissReset) guard.nearMissed = false;
    }
    highest = Math.max(highest, guard.meter);
  }

  world.detection = world.alarm.raised ? 1 : highest;
  world.nearMissPulse = Math.max(0, (world.nearMissPulse ?? 0) - dt * 1.4);
}

/** Every guard hears it: torches turn red and the floor is hunted until the alarm runs out. */
export function raiseAlarm(world) {
  if (world.alarm.raised) return;
  const player = world.player;
  world.alarm.raised = true;
  world.alarm.timer = ALARM.hold;
  world.alarm.flash = 1;
  world.stats.alarms += 1;
  world.notices.push('alarm');

  for (const guard of world.guards) {
    guard.state = 'alert';
    guard.lastKnown = { x: player.x, y: player.y };
    guard.target = null;
    guard.searchTimer = GUARD.alertSearch;
    guard.path = null;
    guard.destKey = '';
    guard.waitTimer = 0;
    guard.meter = 1;
    guard.nearMissed = true;
    guard.flash = Math.max(guard.flash, 0.6);
    mark(world, 'alarm', guard.x, guard.y, 0.8, 42, '#ff5a63');
  }
  emit(world, 'alarm', player.x, player.y, 1);
}

/** The hunt loses its thread after the Moth stays out of sight long enough. */
export function endAlarm(world) {
  if (!world.alarm.raised) return;
  world.alarm.raised = false;
  world.alarm.timer = 0;
  world.notices.push('alarm-end');
  emit(world, 'alarmEnd', world.player.x, world.player.y, 0.8);
  for (const guard of world.guards) {
    guard.state = 'patrol';
    guard.target = null;
    guard.lastKnown = null;
    guard.searchTimer = 0;
    guard.path = null;
    guard.destKey = '';
    guard.waitTimer = 0.5;
    guard.meter = 0;
    guard.nearMissed = false;
    guard.baseFacing = guard.facing;
    guard.sweepPhase = 0;
  }
}

/** Count the alarm down while the Moth is unseen, and hold it while a torch is on them. */
export function updateAlarm(world, dt) {
  world.alarm.flash = Math.max(0, world.alarm.flash - dt * 1.5);
  if (!world.alarm.raised) return;
  const seen = world.guards.some((guard) => guard.sees);
  if (seen) world.alarm.timer = ALARM.hold;
  else world.alarm.timer -= dt;
  if (world.alarm.timer <= 0) endAlarm(world);
}
