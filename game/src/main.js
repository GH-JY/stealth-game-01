// The page entry: it owns the clock. In play it samples the keyboard and mouse once per fixed step,
// advances the world by exactly 1/60 s, drains the sounds the world queued, and paints a frame.
// The title, the clear card, the caught card and the victory card are states of this same loop, so
// every screen is drawn by the same renderer and the run can be restarted without reloading.
// With ?shot=<name>&seed=<n> it stages one deterministic scene instead, paints it twice and stops.

import { MAX_FRAME, SCREEN, STEP, STORAGE_KEY, VIEW } from './config.js';
import { createWorld, loadLevel, restartLevel, stepWorld } from './world.js';
import { ACTION, createInput } from './player.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('stage');
const live = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();
const world = createWorld();
loadLevel(world, 0);

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedValue = Number(params.get('seed'));
const seed = Number.isFinite(seedValue) && seedValue > 0 ? Math.floor(seedValue) : 1;

function readBest() {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeBest(seconds) {
  try {
    const previous = readBest();
    if (previous === undefined || seconds < previous) window.localStorage.setItem(STORAGE_KEY, String(seconds));
  } catch {
    // A browser with storage switched off still plays; the record simply does not persist.
  }
}

function announce(text) {
  if (live && live.textContent !== text) live.textContent = text;
}

if (shotName !== null) {
  const staged = runShot(world, shotName, seed);
  renderer.draw(world, staged.screen, staged.ui);
  renderer.draw(world, staged.screen, staged.ui);
  window.__shotReady = true;
} else {
  let screen = SCREEN.TITLE;
  let clock = 0;
  let accumulator = 0;
  let last = 0;
  let bestTime = readBest();
  let completed = [];
  let totals = undefined;
  let hint = '';

  const pointer = input.pointer;
  const ui = () => ({ time: clock, pointer, bestTime, totals, hint });

  function startRun(index = 0) {
    loadLevel(world, index);
    completed = [];
    totals = undefined;
    accumulator = 0;
    screen = SCREEN.PLAY;
    hint = '';
    input.read(); // a click that begins the run must not also throw a pebble
    announce(`${world.level.night}, ${world.level.name}. Find the keycard and reach the green exit unseen.`);
  }

  function returnToTitle() {
    screen = SCREEN.TITLE;
    totals = undefined;
    accumulator = 0;
    hint = '';
    announce('Title screen. Press Enter to begin.');
  }

  function collectClear() {
    completed.push({
      elapsed: world.stats.elapsed,
      nearMisses: world.stats.nearMisses,
      pebblesThrown: world.stats.pebblesThrown,
      alarms: world.stats.alarms,
    });
    const last = world.levelIndex >= world.levels.length - 1;
    if (!last) {
      announce(`${world.level.name} cleared. Press Enter for the next night.`);
      return;
    }
    totals = completed.reduce(
      (sum, run) => ({
        elapsed: sum.elapsed + run.elapsed,
        nearMisses: sum.nearMisses + run.nearMisses,
        pebblesThrown: sum.pebblesThrown + run.pebblesThrown,
        alarms: sum.alarms + run.alarms,
      }),
      { elapsed: 0, nearMisses: 0, pebblesThrown: 0, alarms: 0 },
    );
    writeBest(totals.elapsed);
    bestTime = readBest();
    announce(`All three nights cleared in ${Math.round(totals.elapsed)} seconds.`);
  }

  function drainSounds() {
    for (const sound of world.sounds) audio.play(sound.name, sound.x, sound.y, sound.gain);
    world.sounds.length = 0;
  }

  function handlePlayActions(mask) {
    if (mask & ACTION.RESTART) {
      restartLevel(world);
      accumulator = 0;
      announce(`${world.level.night} restarted.`);
    } else if (mask & ACTION.BACK) {
      returnToTitle();
    }
  }

  function handleScreenActions(mask) {
    if (screen === SCREEN.CAUGHT) {
      if (mask & (ACTION.RESTART | ACTION.CONFIRM)) {
        restartLevel(world);
        accumulator = 0;
        screen = SCREEN.PLAY;
        announce(`${world.level.night} restarted.`);
      } else if (mask & ACTION.BACK) {
        returnToTitle();
      }
      return;
    }
    if (screen === SCREEN.CLEAR) {
      const last = world.levelIndex >= world.levels.length - 1;
      if (mask & ACTION.CONFIRM) {
        if (last) returnToTitle();
        else startRun(world.levelIndex + 1);
      } else if (mask & ACTION.BACK) {
        returnToTitle();
      } else if (last && mask & ACTION.RESTART) {
        startRun(0);
      }
    }
  }

  function frame(now) {
    const elapsed = last === 0 ? 0 : Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    clock += elapsed;

    const mask = input.takeActions();
    if (screen === SCREEN.TITLE) {
      if (mask & ACTION.CONFIRM) startRun(0);
    } else if (screen === SCREEN.PLAY) {
      handlePlayActions(mask);
      if (screen === SCREEN.PLAY) {
        accumulator = Math.min(accumulator + elapsed, MAX_FRAME);
        while (accumulator >= STEP) {
          stepWorld(world, input.read(), STEP);
          accumulator -= STEP;
          if (world.status !== SCREEN.PLAY) break;
        }
        drainSounds();
        if (world.status !== SCREEN.PLAY) {
          if (world.status === SCREEN.CLEAR) collectClear();
          else announce(world.caughtReason || 'Caught.');
          screen = world.status;
        }
      }
    } else {
      handleScreenActions(mask);
    }

    if (world.player) audio.setListener(world.player.x, world.player.y);
    renderer.draw(world, screen, ui());
    window.requestAnimationFrame(frame);
  }

  const wake = () => audio.unlock();
  window.addEventListener('keydown', wake, { once: true });
  window.addEventListener('pointerdown', wake, { once: true });
  canvas.addEventListener('pointerdown', () => {
    if (screen === SCREEN.TITLE) startRun(0);
  });

  announce('Title screen. Press Enter to begin.');
  window.requestAnimationFrame(frame);
}
