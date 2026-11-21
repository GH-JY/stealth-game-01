// The HUD and the screens: the parchment-thin plaque that names the night, the detection meter
// with its near-miss notch, the keycard and exit slots, the alarm banner, and the title, clear,
// caught and victory screens. All of it is text and simple shapes drawn on the same canvas.

import { VIEW, SCREEN } from './config.js';
import { playerInShadow, playerSeen } from './world.js';

const UI_FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const DISPLAY_FONT = 'Georgia, "Times New Roman", serif';
const CREAM = '#efe3c6';
const GOLD = '#ffd166';
const INK = '#dbe6f5';
const DIM = 'rgba(219, 230, 245, 0.55)';
const RED = '#ff5a63';
const AMBER = '#ffb457';
const GREEN = '#4fe3a3';

function spaced(ctx, amount) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = amount;
}

function panel(ctx, x, y, width, height, options = {}) {
  ctx.save();
  roundedPath(ctx, x, y, width, height, options.radius ?? 10);
  ctx.fillStyle = options.fill ?? 'rgba(6, 10, 18, 0.76)';
  ctx.fill();
  ctx.strokeStyle = options.stroke ?? 'rgba(201, 160, 99, 0.24)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function roundedPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function caps(ctx, text, x, y, options = {}) {
  ctx.save();
  ctx.font = `${options.weight ?? 600} ${options.size ?? 10}px ${UI_FONT}`;
  ctx.fillStyle = options.color ?? 'rgba(239, 227, 198, 0.7)';
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  spaced(ctx, options.spacing ?? '2.5px');
  ctx.fillText(text, x, y);
  spaced(ctx, '0px');
  ctx.restore();
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** The in-play HUD, drawn over the room every frame. */
export function drawHud(ctx, world, ui) {
  const player = world.player;
  const night = world.level.night.toUpperCase();
  const levelNumber = ROMAN[world.levelIndex] ?? String(world.levelIndex + 1);

  // The night plaque.
  panel(ctx, 20, 18, 314, 64, { fill: 'rgba(6, 10, 18, 0.72)' });
  caps(ctx, `${night} · ${world.level.place.toUpperCase()}`, 38, 41, { color: 'rgba(255, 209, 102, 0.8)' });
  ctx.save();
  ctx.font = `400 24px ${DISPLAY_FONT}`;
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'left';
  ctx.fillText(world.level.name, 38, 68);
  ctx.restore();

  drawObjectives(ctx, world, 946, 18);
  drawDetection(ctx, world, ui);
  drawKeyHint(ctx, world);
  drawClock(ctx, world, levelNumber);
  drawStatusChips(ctx, world);

  if (world.alarm.raised) drawAlarmBanner(ctx, world, ui);
  else if (world.nearMissPulse > 0.02) drawNearMissBanner(ctx, world);
  else if (world.exitNudge > 0) drawPrompt(ctx, 'The door is locked. The keycard is still on its desk.', RED);
  else if (world.stats.elapsed < 7 && !world.keycard.taken) {
    drawPrompt(ctx, 'Stay out of the torchlight. Find the keycard, then the green door.', DIM);
  } else if (world.keycard.taken && world.stats.elapsed < 7) {
    drawPrompt(ctx, 'The exit is lit green. Reach it without being seen.', GREEN);
  }
  void ui;
  void player;
}

function drawObjectives(ctx, world, x, y) {
  panel(ctx, x, y, 314, 64, { fill: 'rgba(6, 10, 18, 0.72)' });
  // Keycard row.
  ctx.save();
  ctx.translate(x + 24, y + 25);
  ctx.rotate(-0.12);
  ctx.fillStyle = world.keycard.taken ? GOLD : 'rgba(255, 209, 102, 0.18)';
  roundedPath(ctx, -9, -6, 18, 12, 2);
  ctx.fill();
  ctx.strokeStyle = world.keycard.taken ? 'rgba(70, 52, 20, 0.9)' : 'rgba(255, 209, 102, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = world.keycard.taken ? 'rgba(70, 52, 20, 0.85)' : 'rgba(255, 209, 102, 0.35)';
  ctx.fillRect(-6, -2.5, 7, 1.4);
  ctx.restore();
  caps(ctx, 'KEYCARD', x + 44, y + 24, { color: world.keycard.taken ? GOLD : 'rgba(239, 227, 198, 0.45)', size: 9 });
  ctx.font = `600 12px ${UI_FONT}`;
  ctx.fillStyle = world.keycard.taken ? GOLD : DIM;
  ctx.textAlign = 'left';
  ctx.fillText(world.keycard.taken ? 'IN HAND' : 'ON THE DESK', x + 44, y + 41);

  // Exit row.
  ctx.save();
  ctx.translate(x + 188, y + 30);
  ctx.strokeStyle = world.exit.open ? GREEN : 'rgba(239, 227, 198, 0.35)';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-7, -11, 14, 22);
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.lineTo(4, 0);
  ctx.moveTo(1, -3);
  ctx.lineTo(4, 0);
  ctx.lineTo(1, 3);
  ctx.stroke();
  ctx.restore();
  caps(ctx, 'EXIT', x + 208, y + 24, { color: world.exit.open ? GREEN : 'rgba(239, 227, 198, 0.45)', size: 9 });
  ctx.font = `600 12px ${UI_FONT}`;
  ctx.fillStyle = world.exit.open ? GREEN : DIM;
  ctx.fillText(world.exit.open ? 'LIT' : 'SHUT', x + 208, y + 41);
}

function drawDetection(ctx, world, ui) {
  const meter = Math.min(1, world.alarm.raised ? 1 : world.detection);
  const watched = playerSeen(world);
  const word = world.alarm.raised ? 'ALARM' : watched ? 'WATCHED' : meter > 0.05 ? 'UNEASY' : 'UNSEEN';
  const color = world.alarm.raised ? RED : watched ? AMBER : meter > 0.05 ? AMBER : 'rgba(140, 255, 203, 0.85)';
  const width = 388;
  const x = (VIEW.width - width) / 2;
  const y = 644;

  panel(ctx, x, y, width, 58, {
    fill: 'rgba(6, 10, 18, 0.8)',
    stroke: world.alarm.raised ? 'rgba(255, 90, 99, 0.5)' : 'rgba(201, 160, 99, 0.24)',
  });
  caps(ctx, 'DETECTION', x + 18, y + 22, { size: 9, color: 'rgba(239, 227, 198, 0.6)' });
  ctx.save();
  ctx.font = `700 11px ${UI_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = color;
  spaced(ctx, '1.5px');
  ctx.fillText(word, x + width - 18, y + 22);
  spaced(ctx, '0px');
  ctx.restore();

  const barX = x + 18;
  const barY = y + 32;
  const barW = width - 36;
  const barH = 9;
  ctx.save();
  roundedPath(ctx, barX, barY, barW, barH, 4.5);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fill();
  if (meter > 0.005) {
    const fill = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fill.addColorStop(0, world.alarm.raised ? 'rgba(255, 90, 99, 0.85)' : 'rgba(255, 180, 87, 0.8)');
    fill.addColorStop(1, world.alarm.raised ? 'rgba(255, 40, 60, 0.95)' : 'rgba(255, 90, 99, 0.95)');
    ctx.save();
    roundedPath(ctx, barX, barY, Math.max(barH, barW * meter), barH, 4.5);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(barX, barY + 1.5, barW, 2);
    ctx.restore();
  }
  // The near-miss notch: cross it and a guard calls out.
  const notchX = barX + barW * 0.72;
  ctx.strokeStyle = 'rgba(239, 227, 198, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(notchX, barY - 3);
  ctx.lineTo(notchX, barY + barH + 3);
  ctx.stroke();
  caps(ctx, 'NEAR MISS', notchX + 5, barY + barH + 10, { size: 8, color: 'rgba(239, 227, 198, 0.38)', spacing: '1.5px' });
  if (watched && !world.alarm.raised) {
    ctx.strokeStyle = `rgba(255, 180, 87, ${0.25 + Math.sin(ui.time * 8) * 0.15})`;
    ctx.lineWidth = 1;
    roundedPath(ctx, x - 2, y - 2, width + 4, 62, 12);
    ctx.stroke();
  }
  ctx.restore();

  // A small eye in the panel's corner.
  ctx.save();
  ctx.translate(x + width - 96, y + 34);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawKeyHint(ctx, world) {
  panel(ctx, 20, 668, 330, 34, { fill: 'rgba(6, 10, 18, 0.55)', stroke: 'rgba(201, 160, 99, 0.14)' });
  ctx.save();
  ctx.font = `500 11px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(219, 230, 245, 0.5)';
  ctx.textAlign = 'left';
  ctx.fillText('WASD move  ·  SHIFT crouch  ·  CLICK throw a pebble', 34, 690);
  ctx.restore();
  void world;
}

function drawClock(ctx, world, levelNumber) {
  const x = 1014;
  const y = 668;
  panel(ctx, x, y, 246, 34, { fill: 'rgba(6, 10, 18, 0.55)', stroke: 'rgba(201, 160, 99, 0.14)' });
  ctx.save();
  ctx.font = `600 13px ${UI_FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText(formatTime(world.stats.elapsed), x + 16, y + 22);
  ctx.font = `500 10px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(219, 230, 245, 0.45)';
  spaced(ctx, '1.5px');
  ctx.textAlign = 'right';
  ctx.fillText(`NIGHT ${levelNumber} OF III`, x + 230, y + 22);
  spaced(ctx, '0px');
  ctx.restore();
}

function drawStatusChips(ctx, world) {
  const chips = [];
  if (playerInShadow(world)) chips.push({ label: 'IN SHADOW', color: 'rgba(140, 200, 255, 0.9)' });
  if (world.player.crouch) chips.push({ label: 'CROUCHED', color: 'rgba(239, 227, 198, 0.8)' });
  if (!chips.length) return;
  let x = 450;
  const y = 618;
  for (const chip of chips) {
    ctx.save();
    ctx.font = `600 9px ${UI_FONT}`;
    spaced(ctx, '1.5px');
    const width = ctx.measureText(chip.label).width + 28;
    roundedPath(ctx, x, y, width, 20, 10);
    ctx.fillStyle = 'rgba(6, 10, 18, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(201, 160, 99, 0.18)';
    ctx.stroke();
    ctx.fillStyle = chip.color;
    ctx.beginPath();
    ctx.arc(x + 11, y + 10, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillText(chip.label, x + 19, y + 13);
    spaced(ctx, '0px');
    ctx.restore();
    x += width + 8;
  }
}

function drawPrompt(ctx, text, color) {
  ctx.save();
  ctx.font = `500 13px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width + 34;
  roundedPath(ctx, VIEW.width / 2 - width / 2, 578, width, 28, 14);
  ctx.fillStyle = 'rgba(6, 10, 18, 0.68)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201, 160, 99, 0.16)';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, VIEW.width / 2, 593);
  ctx.restore();
}

function drawNearMissBanner(ctx, world) {
  const alpha = 0.55 + Math.min(1, world.nearMissPulse) * 0.45;
  ctx.save();
  ctx.globalAlpha = alpha;
  const width = 360;
  roundedPath(ctx, VIEW.width / 2 - width / 2, 96, width, 40, 8);
  ctx.fillStyle = 'rgba(40, 20, 6, 0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 180, 87, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.font = `700 13px ${UI_FONT}`;
  ctx.textAlign = 'center';
  spaced(ctx, '3px');
  ctx.fillText('NEARLY SEEN', VIEW.width / 2 - 38, 121);
  spaced(ctx, '0px');
  ctx.font = `500 12px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255, 225, 190, 0.8)';
  ctx.textAlign = 'left';
  ctx.fillText('break the line of sight', VIEW.width / 2 + 44, 121);
  ctx.restore();
}

function drawAlarmBanner(ctx, world, ui) {
  const pulse = 0.5 + Math.sin(ui.time * 7) * 0.5;
  ctx.save();
  const width = 470;
  roundedPath(ctx, VIEW.width / 2 - width / 2, 92, width, 54, 8);
  ctx.fillStyle = `rgba(46, 8, 14, ${0.82 + pulse * 0.08})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 90, 99, ${0.55 + pulse * 0.4})`;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.font = `700 17px ${UI_FONT}`;
  ctx.textAlign = 'center';
  spaced(ctx, '6px');
  ctx.fillText('ALARM', VIEW.width / 2 - 96, 115);
  spaced(ctx, '0px');
  ctx.font = `500 12px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255, 210, 214, 0.9)';
  ctx.textAlign = 'left';
  ctx.fillText('Hide until the search passes. Every guard is looking.', VIEW.width / 2 - 30, 124);
  ctx.textAlign = 'center';
  ctx.font = `500 10px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255, 170, 176, 0.65)';
  ctx.fillText(`the alarm holds for ${Math.max(0, Math.ceil(world.alarm.timer))}s more while you are seen`, VIEW.width / 2, 136);
  ctx.restore();
}

function shade(ctx, alpha) {
  ctx.fillStyle = `rgba(4, 7, 12, ${alpha})`;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

function bigTitle(ctx, text, x, y, size, options = {}) {
  ctx.save();
  ctx.font = `400 ${size}px ${DISPLAY_FONT}`;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  const gradient = ctx.createLinearGradient(0, y - size, 0, y + 10);
  gradient.addColorStop(0, '#fff6df');
  gradient.addColorStop(0.55, options.mid ?? CREAM);
  gradient.addColorStop(1, options.low ?? GOLD);
  ctx.fillStyle = gradient;
  if (options.glow) {
    ctx.shadowColor = options.glow;
    ctx.shadowBlur = 26;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** The title: the name, the controls, and the promise of three nights. */
export function drawTitleScreen(ctx, world, ui) {
  ctx.save();
  // A soft dark wash behind the words so the type stays readable over the lantern art.
  const wash = ctx.createLinearGradient(0, 0, 760, 0);
  wash.addColorStop(0, 'rgba(4, 7, 12, 0.72)');
  wash.addColorStop(0.72, 'rgba(4, 7, 12, 0.35)');
  wash.addColorStop(1, 'rgba(4, 7, 12, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 900, VIEW.height);

  caps(ctx, 'A STEALTH GAME IN THREE NIGHTS', 96, 116, { size: 11, spacing: '5px', color: 'rgba(255, 209, 102, 0.75)' });
  bigTitle(ctx, 'MOTH', 90, 214, 104, { glow: 'rgba(255, 190, 110, 0.25)' });
  bigTitle(ctx, '& KEY', 90, 306, 104, { mid: '#ffd166', low: '#c9962f', glow: 'rgba(255, 190, 110, 0.25)' });

  ctx.strokeStyle = 'rgba(201, 160, 99, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(96, 330);
  ctx.lineTo(468, 330);
  ctx.stroke();

  ctx.font = `italic 400 17px ${DISPLAY_FONT}`;
  ctx.fillStyle = 'rgba(239, 227, 198, 0.8)';
  ctx.textAlign = 'left';
  ctx.fillText('Take the keycard from its desk. Reach the green door unseen.', 96, 360);

  panel(ctx, 96, 388, 548, 208, { fill: 'rgba(6, 10, 18, 0.72)' });
  const rows = [
    ['WASD  /  ARROWS', 'Move'],
    ['HOLD  SHIFT', 'Crouch — slower, quieter, harder to see'],
    ['LEFT  CLICK', 'Throw a pebble; the nearest guard goes to look'],
    ['R', 'Restart the night'],
    ['ESC', 'Leave for the title'],
    ['ENTER', 'Begin, or go on to the next night'],
  ];
  let rowY = 416;
  for (const [keys, meaning] of rows) {
    ctx.font = `600 10px ${UI_FONT}`;
    spaced(ctx, '1px');
    const keyWidth = ctx.measureText(keys).width + 18;
    roundedPath(ctx, 116, rowY - 13, keyWidth, 20, 4);
    ctx.fillStyle = 'rgba(239, 227, 198, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(239, 227, 198, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(keys, 125, rowY + 1);
    spaced(ctx, '0px');
    ctx.font = `400 13px ${UI_FONT}`;
    ctx.fillStyle = 'rgba(219, 230, 245, 0.72)';
    ctx.fillText(meaning, 268, rowY + 1);
    rowY += 30;
  }

  const pulse = 0.62 + Math.sin(ui.time * 2.6) * 0.28;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.font = `600 15px ${UI_FONT}`;
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'left';
  spaced(ctx, '4px');
  ctx.fillText('PRESS ENTER TO BEGIN', 98, 646);
  spaced(ctx, '0px');
  ctx.globalAlpha = 0.55;
  ctx.font = `400 11px ${UI_FONT}`;
  ctx.fillStyle = DIM;
  ctx.fillText('or click anywhere', 356, 646);
  ctx.restore();

  ctx.font = `400 10px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(219, 230, 245, 0.32)';
  ctx.textAlign = 'left';
  ctx.fillText('Every room, guard and sound is drawn and played from code. Nothing is downloaded.', 96, 690);
  if (ui.bestTime) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 209, 102, 0.55)';
    ctx.fillText(`BEST RUN ${formatTime(ui.bestTime)}`, 1184, 690);
  }
  if (ui.hint) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(219, 230, 245, 0.45)';
    ctx.fillText(ui.hint, 1184, 116);
  }
  ctx.restore();
  void world;
}

/** The night-clear card: what it cost and how quickly. */
export function drawClearScreen(ctx, world, ui) {
  shade(ctx, 0.68);
  const width = 600;
  const x = (VIEW.width - width) / 2;
  const y = 168;
  panel(ctx, x, y, width, 384, { fill: 'rgba(7, 12, 20, 0.9)', stroke: 'rgba(201, 160, 99, 0.35)' });
  caps(ctx, `${world.level.night.toUpperCase()} CLEARED`, VIEW.width / 2, y + 44, {
    align: 'center',
    spacing: '6px',
    color: GREEN,
    size: 11,
  });
  bigTitle(ctx, world.level.name, VIEW.width / 2, y + 94, 36, { align: 'center' });
  ctx.font = `italic 400 14px ${DISPLAY_FONT}`;
  ctx.fillStyle = 'rgba(239, 227, 198, 0.65)';
  ctx.textAlign = 'center';
  ctx.fillText(`The keycard is out of ${world.level.place.toLowerCase()}, and the door is behind you.`, VIEW.width / 2, y + 122);

  ctx.font = `400 62px ${DISPLAY_FONT}`;
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'center';
  ctx.fillText(formatTime(world.stats.elapsed), VIEW.width / 2, y + 194);
  const underPar = world.stats.elapsed <= world.level.par;
  ctx.save();
  ctx.font = `600 10px ${UI_FONT}`;
  spaced(ctx, '2px');
  const label = underPar ? `UNDER PAR · ${formatTime(world.level.par)}` : `PAR ${formatTime(world.level.par)}`;
  const chipWidth = ctx.measureText(label).width + 26;
  roundedPath(ctx, VIEW.width / 2 - chipWidth / 2, y + 208, chipWidth, 22, 11);
  ctx.fillStyle = underPar ? 'rgba(255, 209, 102, 0.14)' : 'rgba(239, 227, 198, 0.06)';
  ctx.fill();
  ctx.strokeStyle = underPar ? 'rgba(255, 209, 102, 0.6)' : 'rgba(239, 227, 198, 0.2)';
  ctx.stroke();
  ctx.fillStyle = underPar ? GOLD : DIM;
  ctx.textAlign = 'center';
  ctx.fillText(label, VIEW.width / 2, y + 223);
  spaced(ctx, '0px');
  ctx.restore();

  ctx.strokeStyle = 'rgba(201, 160, 99, 0.18)';
  ctx.beginPath();
  ctx.moveTo(x + 60, y + 252);
  ctx.lineTo(x + width - 60, y + 252);
  ctx.stroke();

  const stats = [
    ['NEAR MISSES', String(world.stats.nearMisses)],
    ['PEBBLES THROWN', String(world.stats.pebblesThrown)],
    ['ALARMS RAISED', String(world.stats.alarms)],
  ];
  stats.forEach(([label, value], index) => {
    const columnX = x + 100 + index * 200;
    caps(ctx, label, columnX, y + 282, { size: 9, color: 'rgba(239, 227, 198, 0.45)', align: 'center' });
    ctx.font = `400 26px ${DISPLAY_FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(value, columnX, y + 312);
  });

  const last = world.levelIndex >= world.levels.length - 1;
  const pulse = 0.7 + Math.sin(ui.time * 3) * 0.25;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.font = `600 14px ${UI_FONT}`;
  ctx.fillStyle = last ? GOLD : CREAM;
  ctx.textAlign = 'center';
  spaced(ctx, last ? '3px' : '2px');
  ctx.fillText(last ? 'PRESS ENTER TO SEE THE NIGHT OUT' : 'PRESS ENTER FOR THE NEXT NIGHT', VIEW.width / 2, y + 358);
  spaced(ctx, '0px');
  ctx.restore();
  caps(ctx, 'ESC  return to the title', VIEW.width / 2, y + 380, {
    align: 'center',
    size: 9,
    color: 'rgba(239, 227, 198, 0.35)',
    spacing: '1.5px',
  });
}

/** The caught card: what gave you away, and the way back in. */
export function drawCaughtScreen(ctx, world, ui) {
  shade(ctx, 0.66);
  const width = 600;
  const x = (VIEW.width - width) / 2;
  const y = 190;
  panel(ctx, x, y, width, 330, { fill: 'rgba(16, 7, 10, 0.9)', stroke: 'rgba(255, 90, 99, 0.4)' });
  caps(ctx, 'THE ALARM HAS YOU', VIEW.width / 2, y + 42, {
    align: 'center',
    spacing: '6px',
    color: RED,
    size: 11,
  });
  bigTitle(ctx, 'CAUGHT', VIEW.width / 2, y + 108, 66, { align: 'center', mid: '#ffd9d9', low: '#ff5a63' });
  ctx.font = `400 15px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255, 226, 226, 0.82)';
  ctx.textAlign = 'center';
  ctx.fillText(world.caughtReason || 'A guard saw you.', VIEW.width / 2, y + 146);

  ctx.font = `400 13px ${UI_FONT}`;
  ctx.fillStyle = DIM;
  ctx.fillText(
    `${world.level.night} · ${formatTime(world.stats.elapsed)} in · ${world.stats.nearMisses} near miss${world.stats.nearMisses === 1 ? '' : 'es'}`,
    VIEW.width / 2,
    y + 178,
  );

  ctx.save();
  ctx.font = `500 13px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(239, 227, 198, 0.55)';
  ctx.fillText('The keycard stays on its desk. The night can begin again.', VIEW.width / 2, y + 222);
  ctx.restore();

  const pulse = 0.7 + Math.sin(ui.time * 3) * 0.25;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.font = `600 14px ${UI_FONT}`;
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'center';
  spaced(ctx, '2px');
  ctx.fillText('R  TRY AGAIN', VIEW.width / 2, y + 268);
  spaced(ctx, '0px');
  ctx.restore();
  caps(ctx, 'ESC  return to the title', VIEW.width / 2, y + 296, {
    align: 'center',
    size: 9,
    color: 'rgba(239, 227, 198, 0.35)',
    spacing: '1.5px',
  });
}

/** The last card: all three nights, and the totals of a quiet run. */
export function drawVictoryScreen(ctx, world, ui) {
  shade(ctx, 0.72);
  const width = 660;
  const x = (VIEW.width - width) / 2;
  const y = 128;
  panel(ctx, x, y, width, 452, { fill: 'rgba(6, 12, 16, 0.92)', stroke: 'rgba(79, 227, 163, 0.35)' });
  caps(ctx, 'ALL THREE NIGHTS', VIEW.width / 2, y + 42, {
    align: 'center',
    spacing: '6px',
    color: GREEN,
    size: 11,
  });
  bigTitle(ctx, 'THE KEY', VIEW.width / 2, y + 112, 62, { align: 'center', mid: '#e8fff4', low: GREEN });
  bigTitle(ctx, 'IS HOME', VIEW.width / 2, y + 176, 62, { align: 'center', mid: '#e8fff4', low: GREEN });
  ctx.font = `italic 400 16px ${DISPLAY_FONT}`;
  ctx.fillStyle = 'rgba(239, 227, 198, 0.78)';
  ctx.textAlign = 'center';
  ctx.fillText('Three rooms. Three keys of the same lock. No one saw the Moth.', VIEW.width / 2, y + 214);

  const totals = ui.totals ?? {
    elapsed: world.stats.elapsed,
    nearMisses: world.stats.nearMisses,
    pebblesThrown: world.stats.pebblesThrown,
    alarms: world.stats.alarms,
  };
  const stats = [
    ['TOTAL TIME', formatTime(totals.elapsed)],
    ['NEAR MISSES', String(totals.nearMisses)],
    ['PEBBLES', String(totals.pebblesThrown)],
    ['ALARMS', String(totals.alarms)],
  ];
  stats.forEach(([label, value], index) => {
    const columnX = x + 100 + index * 153;
    caps(ctx, label, columnX, y + 262, { size: 9, color: 'rgba(239, 227, 198, 0.45)', align: 'center' });
    ctx.font = `400 26px ${DISPLAY_FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(value, columnX, y + 294);
  });

  ctx.strokeStyle = 'rgba(201, 160, 99, 0.18)';
  ctx.beginPath();
  ctx.moveTo(x + 60, y + 322);
  ctx.lineTo(x + width - 60, y + 322);
  ctx.stroke();

  ctx.font = `italic 400 15px ${DISPLAY_FONT}`;
  ctx.fillStyle = 'rgba(239, 227, 198, 0.65)';
  ctx.textAlign = 'center';
  ctx.fillText('The archive will keep its secret. The Moth keeps the key.', VIEW.width / 2, y + 356);

  const pulse = 0.7 + Math.sin(ui.time * 3) * 0.25;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.font = `600 14px ${UI_FONT}`;
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'center';
  spaced(ctx, '2px');
  ctx.fillText('ENTER  RETURN TO THE TITLE', VIEW.width / 2 - 74, y + 408);
  spaced(ctx, '0px');
  ctx.restore();
  caps(ctx, 'R  RUN THE THREE NIGHTS AGAIN', VIEW.width / 2 + 108, y + 408, {
    align: 'center',
    size: 10,
    color: 'rgba(239, 227, 198, 0.45)',
    spacing: '1.5px',
  });
}
