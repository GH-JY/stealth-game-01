// All tuning for MOTH & KEY in one place: the frame, the player's feet, a guard's eyes, how fast
// suspicion gathers and how long the alarm holds. Every module reads its numbers from here.

export const VIEW = { width: 1280, height: 720 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The one simulation step. Rendering may run at any rate; the rules never do. */
export const STEP = 1 / 60;
/** The longest stall a frame may replay; a hidden tab's minutes are dropped, not simulated. */
export const MAX_FRAME = 0.25;

export const PLAYER = {
  radius: 11,
  walk: 168,
  crouchSpeed: 84,
  acceleration: 2100,
  friction: 2400,
  stepWalk: 0.40,
  stepCrouch: 0.66,
  stepQuiet: 0.45,
  pickupReach: 56,
  throwCooldown: 0.85,
  scarfTrail: 7,
};

export const GUARD = {
  radius: 12,
  patrolSpeed: 64,
  suspiciousSpeed: 102,
  alertSpeed: 152,
  turnRate: 3.6,
  waypointReach: 8,
  pauseAtWaypoint: 1.5,
  sweepArc: 0.85,
  sweepRate: 1.15,
  investigateLook: 3.2,
  alertSearch: 4.0,
  stepInterval: 0.56,
  /** Vision by state: length in pixels, half-angle in radians. */
  range: { patrol: 252, suspicious: 300, alert: 336 },
  halfAngle: { patrol: 0.46, suspicious: 0.53, alert: 0.62 },
  /** A crouched target is smaller; a shadowed one is swallowed by the dark. */
  crouchRange: 0.78,
  shadowRange: 0.62,
  crouchMeter: 0.55,
  shadowMeter: 0.46,
  touchReach: 4,
};

export const DETECTION = {
  fill: 0.72,
  drain: 0.34,
  closeBias: 0.55,
  suspiciousBoost: 1.18,
  alertDrain: 0.5,
  nearMiss: 0.72,
  nearMissReset: 0.34,
  flashTime: 0.55,
};

export const ALARM = {
  hold: 7.5,
  fadeIn: 0.35,
  meterFloor: 0.999,
};

export const PEBBLE = {
  speed: 760,
  maxRange: 560,
  radius: 4,
  noiseRadius: 430,
  clatterLife: 0.7,
};

export const EXIT = {
  reach: 30,
};

export const SCREEN = {
  TITLE: 'title',
  PLAY: 'play',
  CLEAR: 'clear',
  CAUGHT: 'caught',
  VICTORY: 'victory',
};

export const STORAGE_KEY = 'moth-and-key-best-times';
