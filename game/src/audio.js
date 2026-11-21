// Every sound in MOTH & KEY is made here with WebAudio: no file is loaded. Footsteps are filtered
// noise, the alarm is a pair of detuned saws, the keycard is a small rising chime. Sounds placed in
// the room are panned and softened by their distance from the Moth, so a guard's step tells you
// which side of you it is on before you ever see the torch.

import { VIEW } from './config.js';

/**
 * The audio engine. It stays asleep until the first real gesture (browsers refuse to start a
 * context before one), and every call is a no-op until then, so the game never throws in a silent
 * browser or during a staged screenshot.
 */
export function createAudio() {
  let context = null;
  let master = null;
  let noise = null;
  const listener = { x: VIEW.width / 2, y: VIEW.height / 2 };

  function ensure() {
    if (context) return context;
    const AudioClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioClass) return null;
    context = new AudioClass();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return context;
  }

  function wake() {
    const started = ensure();
    if (started && started.state === 'suspended') started.resume();
  }

  function place(x, y, gain) {
    const dx = x - listener.x;
    const dy = y - listener.y;
    const distance = Math.hypot(dx, dy);
    const falloff = Math.max(0.04, 1 - distance / 780);
    return {
      gain: Math.max(0.02, gain * falloff * falloff),
      pan: Math.max(-1, Math.min(1, dx / 620)),
      muted: distance > 900 ? 0.35 : 1,
      dy,
    };
  }

  function panner(pan) {
    if (typeof context.createStereoPanner === 'function') {
      const node = context.createStereoPanner();
      node.pan.value = pan;
      return node;
    }
    return context.createGain();
  }

  function tone({ type = 'sine', from, to = from, start = 0, length = 0.2, volume = 0.2, pan = 0, detune = 0 }) {
    const began = context.currentTime + start;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, began);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), began + length);
    osc.detune.value = detune;
    amp.gain.setValueAtTime(0.0001, began);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), began + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, began + length);
    const panNode = panner(pan);
    osc.connect(amp).connect(panNode).connect(master);
    osc.start(began);
    osc.stop(began + length + 0.05);
  }

  function burst({ start = 0, length = 0.09, volume = 0.2, pan = 0, frequency = 900, q = 1.2, type = 'bandpass', rate = 1 }) {
    const began = context.currentTime + start;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = rate;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, began);
    filter.Q.value = q;
    const amp = context.createGain();
    amp.gain.setValueAtTime(Math.max(0.0002, volume), began);
    amp.gain.exponentialRampToValueAtTime(0.0001, began + length);
    const panNode = panner(pan);
    source.connect(filter).connect(amp).connect(panNode).connect(master);
    source.start(began);
    source.stop(began + length + 0.03);
  }

  const SOUNDS = {
    step(x, y, gain) {
      const spot = place(x, y, gain * 0.16);
      burst({ length: 0.07, volume: spot.gain, pan: spot.pan, frequency: 420, q: 1.1, rate: 1.3 });
      tone({ type: 'sine', from: 120, to: 70, length: 0.06, volume: spot.gain * 0.5, pan: spot.pan });
    },
    'guard-step'(x, y, gain) {
      const spot = place(x, y, gain * 0.2);
      burst({ length: 0.08, volume: spot.gain, pan: spot.pan, frequency: 260, q: 0.9, rate: 0.9 });
      tone({ type: 'sine', from: 82, to: 58, length: 0.08, volume: spot.gain * 0.55, pan: spot.pan });
    },
    throw(x, y, gain) {
      const spot = place(x, y, gain * 0.12);
      burst({ length: 0.12, volume: spot.gain, pan: spot.pan, frequency: 1800, q: 0.8, type: 'highpass' });
    },
    pebble(x, y, gain) {
      const spot = place(x, y, gain * 0.3);
      burst({ length: 0.05, volume: spot.gain, pan: spot.pan, frequency: 2400, q: 2, type: 'bandpass' });
      burst({ start: 0.09, length: 0.07, volume: spot.gain * 0.7, pan: spot.pan, frequency: 1700, q: 2.4 });
      tone({ type: 'triangle', from: 640, to: 420, length: 0.1, volume: spot.gain * 0.3, pan: spot.pan });
    },
    keycard(x, y, gain) {
      const spot = place(x, y, gain * 0.2);
      tone({ from: 784, length: 0.22, volume: spot.gain, pan: spot.pan });
      tone({ start: 0.1, from: 1175, length: 0.3, volume: spot.gain * 0.8, pan: spot.pan });
      tone({ start: 0.2, from: 1568, length: 0.35, volume: spot.gain * 0.55, pan: spot.pan });
    },
    locked(x, y, gain) {
      const spot = place(x, y, gain * 0.2);
      tone({ type: 'square', from: 190, to: 120, length: 0.14, volume: spot.gain * 0.4, pan: spot.pan });
    },
    heard(x, y, gain) {
      const spot = place(x, y, gain * 0.2);
      tone({ type: 'triangle', from: 520, to: 700, length: 0.14, volume: spot.gain, pan: spot.pan });
    },
    spotted(x, y, gain) {
      const spot = place(x, y, gain * 0.2);
      tone({ type: 'square', from: 880, to: 960, length: 0.09, volume: spot.gain * 0.5, pan: spot.pan });
    },
    nearMiss(x, y, gain) {
      const spot = place(x, y, gain * 0.25);
      tone({ type: 'sawtooth', from: 660, to: 622, length: 0.16, volume: spot.gain * 0.4, pan: spot.pan });
      tone({ type: 'sawtooth', from: 628, to: 590, length: 0.22, start: 0.13, volume: spot.gain * 0.4, pan: spot.pan });
      burst({ start: 0.05, length: 0.3, volume: spot.gain * 0.12, pan: spot.pan, frequency: 3000, type: 'highpass' });
    },
    alarm(x, y, gain) {
      const spot = place(x, y, gain * 0.3);
      for (let index = 0; index < 4; index += 1) {
        tone({
          type: 'sawtooth',
          from: index % 2 === 0 ? 620 : 470,
          to: index % 2 === 0 ? 590 : 450,
          start: index * 0.17,
          length: 0.17,
          volume: spot.gain * 0.3,
          pan: spot.pan,
          detune: index % 2 === 0 ? 6 : -6,
        });
      }
      burst({ length: 0.7, volume: spot.gain * 0.09, pan: spot.pan, frequency: 700, q: 0.7 });
    },
    alarmEnd(x, y, gain) {
      const spot = place(x, y, gain * 0.18);
      tone({ from: 392, to: 330, length: 0.3, volume: spot.gain * 0.6, pan: spot.pan });
      tone({ start: 0.22, from: 294, to: 220, length: 0.5, volume: spot.gain * 0.5, pan: spot.pan });
    },
    caught(x, y, gain) {
      const spot = place(x, y, gain * 0.3);
      tone({ type: 'sawtooth', from: 180, to: 60, length: 0.6, volume: spot.gain * 0.6, pan: spot.pan });
      burst({ length: 0.35, volume: spot.gain * 0.3, pan: spot.pan, frequency: 300, q: 0.6, rate: 0.6 });
    },
    clear(x, y, gain) {
      const spot = place(x, y, gain * 0.25);
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((frequency, index) => {
        tone({ from: frequency, length: 0.5, start: index * 0.12, volume: spot.gain * 0.55, pan: spot.pan });
      });
    },
  };

  return {
    /** Called on the first key or click: a browser starts audio only from a gesture. */
    unlock: wake,
    setListener(x, y) {
      listener.x = x;
      listener.y = y;
    },
    /** Play a named sound in the room; unknown names are ignored, as is everything before unlock. */
    play(name, x, y, gain = 1) {
      if (!context || context.state === 'closed') return;
      const sound = SOUNDS[name];
      if (sound) sound(x, y, gain);
    },
    get ready() {
      return Boolean(context) && context.state === 'running';
    },
  };
}
