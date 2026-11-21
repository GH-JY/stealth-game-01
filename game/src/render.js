// The renderer: every wall, crate, desk, guard, cone, lamp and the moth itself is drawn here with
// canvas paths, no image is loaded. The level's still parts are painted once into an offscreen
// layer; the moving parts (torches clipped by walls, warm lamp pools, the keycard's glint, the
// green exit, the Moth's scarf) are painted each frame over it. The HUD and the screens come from
// hud.js on top.

import { VIEW, TILE, SCREEN } from './config.js';
import { KIND, kindAt, rayReach, tileOf } from './geometry.js';
import { coneShape } from './guards.js';
import { drawHud, drawTitleScreen, drawClearScreen, drawCaughtScreen, drawVictoryScreen } from './hud.js';

export const PALETTE = {
  night: '#05080f',
  floor: '#1c2534',
  floorDark: '#131b28',
  shadow: '#0a1019',
  wallTop: '#3b4a68',
  wallBottom: '#1a2335',
  crate: '#7a5633',
  crateDark: '#513620',
  crateLight: '#b98a52',
  desk: '#4b3549',
  deskTop: '#6b4f68',
  brass: '#c9a063',
  cream: '#efe3c6',
  gold: '#ffd166',
  exit: '#4fe3a3',
  red: '#ff5a63',
  amber: '#ffb457',
  ink: '#dbe6f5',
};

const CONE_RGB = {
  patrol: '255, 190, 110',
  suspicious: '255, 146, 66',
  alert: '255, 84, 96',
};

/** A small deterministic hash for floor grit and paper, so a level looks the same every visit. */
function hash2(x, y, salt = 0) {
  let value = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35) ^ Math.imul(salt + 1, 0x27d4eb2f);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value ^= value >>> 12;
  return (value >>> 0) / 4294967295;
}

function rounded(ctx, x, y, width, height, radius) {
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

export function createRenderer(canvas) {
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  const ctx = canvas.getContext('2d');
  let layer = null;
  let layerKey = '';

  function layerFor(world) {
    const key = `${world.levelIndex}:${world.level.key}`;
    if (key === layerKey && layer) return layer;
    layer = paintLevel(world);
    layerKey = key;
    return layer;
  }

  function draw(world, screen, ui) {
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    if (screen === SCREEN.TITLE) {
      drawTitleArt(ctx, world, ui);
      drawTitleScreen(ctx, world, ui);
      return;
    }

    const shake = world.alarm.raised ? world.alarm.flash * 2.4 : 0;
    ctx.save();
    if (shake > 0.2) ctx.translate(Math.sin(world.time * 47) * shake, Math.cos(world.time * 39) * shake);

    ctx.drawImage(layerFor(world), 0, 0);
    drawFloorLight(ctx, world, ui);
    drawExit(ctx, world, ui);
    drawKeycard(ctx, world, ui);
    drawCones(ctx, world, ui);
    drawEffects(ctx, world);
    drawPebbles(ctx, world);
    for (const guard of world.guards) drawGuard(ctx, world, guard, ui);
    drawPlayer(ctx, world, ui);
    drawAtmosphere(ctx, world, ui);
    ctx.restore();

    drawHud(ctx, world, ui);

    if (screen === SCREEN.CLEAR) {
      if (world.levelIndex >= world.levels.length - 1) drawVictoryScreen(ctx, world, ui);
      else drawClearScreen(ctx, world, ui);
    } else if (screen === SCREEN.CAUGHT) drawCaughtScreen(ctx, world, ui);
    else if (screen === SCREEN.VICTORY) drawVictoryScreen(ctx, world, ui);
  }

  return { draw };
}

/** Paint the still life of a level once: floor, grit, wall shadow, walls, crates and desks. */
function paintLevel(world) {
  const cached = document.createElement('canvas');
  cached.width = VIEW.width;
  cached.height = VIEW.height;
  const g = cached.getContext('2d');
  const grid = world.grid;
  g.fillStyle = PALETTE.night;
  g.fillRect(0, 0, VIEW.width, VIEW.height);

  for (let ty = 0; ty < grid.rows; ty += 1) {
    for (let tx = 0; tx < grid.cols; tx += 1) {
      const kind = kindAt(grid, tx, ty);
      const px = tx * TILE;
      const py = ty * TILE;
      if (kind === KIND.WALL) {
        g.fillStyle = '#0a1019';
        g.fillRect(px, py, TILE, TILE);
        continue;
      }
      paintFloorTile(g, kind, tx, ty, px, py);
    }
  }

  // Everything solid throws a shadow onto the floor first, so furniture sits in the room.
  g.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (let ty = 0; ty < grid.rows; ty += 1) {
    for (let tx = 0; tx < grid.cols; tx += 1) {
      if (!isFurniture(kindAt(grid, tx, ty))) continue;
      g.fillRect(tx * TILE + 9, ty * TILE + 12, TILE, TILE);
    }
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.3)';
  for (let ty = 0; ty < grid.rows; ty += 1) {
    for (let tx = 0; tx < grid.cols; tx += 1) {
      if (!isFurniture(kindAt(grid, tx, ty))) continue;
      g.fillRect(tx * TILE + 5, ty * TILE + 7, TILE, TILE);
    }
  }

  for (let ty = 0; ty < grid.rows; ty += 1) {
    for (let tx = 0; tx < grid.cols; tx += 1) {
      const kind = kindAt(grid, tx, ty);
      const px = tx * TILE;
      const py = ty * TILE;
      if (kind === KIND.WALL) paintWall(g, tx, ty, px, py);
      else if (kind === KIND.CRATE) paintCrate(g, tx, ty, px, py);
      else if (kind === KIND.DESK || kind === KIND.KEYCARD) paintDesk(g, tx, ty, px, py, kind === KIND.KEYCARD);
    }
  }
  return cached;
}

function isFurniture(kind) {
  return kind === KIND.WALL || kind === KIND.CRATE || kind === KIND.DESK || kind === KIND.KEYCARD;
}

function paintFloorTile(g, kind, tx, ty, px, py) {
  const grit = hash2(tx, ty, 3);
  if (kind === KIND.SHADOW) {
    g.fillStyle = `hsl(219, 33%, ${5 + grit * 2.5}%)`;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = 'rgba(88, 122, 160, 0.05)';
    g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    for (let speck = 0; speck < 3; speck += 1) {
      const sx = px + 4 + hash2(tx, ty, speck + 11) * 32;
      const sy = py + 4 + hash2(tx, ty, speck + 21) * 32;
      g.fillStyle = `rgba(120, 150, 190, ${0.05 + hash2(tx, ty, speck + 31) * 0.05})`;
      g.fillRect(sx, sy, 1.5, 1.5);
    }
    return;
  }
  const lightness = 13.5 + grit * 2.4;
  const hue = 214 + hash2(tx, ty, 7) * 8;
  g.fillStyle = `hsl(${hue}, 25%, ${lightness}%)`;
  g.fillRect(px, py, TILE, TILE);
  // A tiled floor: a hairline seam and a worn patch of colour on some tiles.
  g.strokeStyle = 'rgba(120, 158, 200, 0.07)';
  g.lineWidth = 1;
  g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  if (hash2(tx, ty, 13) > 0.72) {
    g.fillStyle = 'rgba(255, 210, 150, 0.025)';
    g.fillRect(px + 6, py + 8, 24, 20);
  }
  for (let speck = 0; speck < 2; speck += 1) {
    const sx = px + 5 + hash2(tx, ty, speck + 41) * 30;
    const sy = py + 5 + hash2(tx, ty, speck + 51) * 30;
    g.fillStyle = `rgba(160, 190, 220, ${0.04 + hash2(tx, ty, speck + 61) * 0.05})`;
    g.fillRect(sx, sy, 1.5, 1.5);
  }
  if (kind === KIND.EXIT) {
    g.fillStyle = 'rgba(79, 227, 163, 0.06)';
    g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  }
}

function paintWall(g, tx, ty, px, py) {
  const shade = hash2(tx, ty, 71);
  const gradient = g.createLinearGradient(px, py, px, py + TILE);
  gradient.addColorStop(0, shade > 0.5 ? '#3d4d6d' : '#354462');
  gradient.addColorStop(1, '#192233');
  g.fillStyle = gradient;
  g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
  g.fillStyle = 'rgba(160, 188, 224, 0.2)';
  g.fillRect(px + 2, py + 2, TILE - 4, 1.5);
  g.fillStyle = 'rgba(0, 0, 0, 0.42)';
  g.fillRect(px + 2, py + TILE - 5, TILE - 4, 3);
  g.strokeStyle = 'rgba(6, 10, 18, 0.85)';
  g.lineWidth = 1;
  g.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
  // Masonry seams, faint.
  g.strokeStyle = 'rgba(0, 0, 0, 0.16)';
  g.beginPath();
  g.moveTo(px + 20.5, py + 2);
  g.lineTo(px + 20.5, py + TILE - 3);
  g.stroke();
  g.fillStyle = 'rgba(201, 160, 99, 0.22)';
  g.beginPath();
  g.arc(px + 6, py + 6, 1.4, 0, Math.PI * 2);
  g.arc(px + TILE - 6, py + TILE - 6, 1.4, 0, Math.PI * 2);
  g.fill();
}

function paintCrate(g, tx, ty, px, py) {
  const tilt = (hash2(tx, ty, 91) - 0.5) * 0.06;
  g.save();
  g.translate(px + TILE / 2, py + TILE / 2);
  g.rotate(tilt);
  const width = 34;
  const height = 34;
  const wood = g.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  wood.addColorStop(0, '#8a6138');
  wood.addColorStop(0.55, PALETTE.crate);
  wood.addColorStop(1, PALETTE.crateDark);
  g.fillStyle = wood;
  rounded(g, -width / 2, -height / 2, width, height, 3);
  g.fill();
  g.strokeStyle = 'rgba(30, 18, 8, 0.8)';
  g.lineWidth = 1.4;
  g.stroke();
  g.strokeStyle = 'rgba(45, 28, 12, 0.55)';
  g.lineWidth = 1;
  for (let plank = -8; plank <= 8; plank += 8) {
    g.beginPath();
    g.moveTo(-width / 2 + 3, plank);
    g.lineTo(width / 2 - 3, plank);
    g.stroke();
  }
  g.strokeStyle = 'rgba(40, 24, 10, 0.5)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(-width / 2 + 4, -height / 2 + 4);
  g.lineTo(width / 2 - 4, height / 2 - 4);
  g.moveTo(width / 2 - 4, -height / 2 + 4);
  g.lineTo(-width / 2 + 4, height / 2 - 4);
  g.stroke();
  g.strokeStyle = 'rgba(220, 172, 108, 0.4)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-width / 2 + 2, -height / 2 + 2);
  g.lineTo(width / 2 - 2, -height / 2 + 2);
  g.stroke();
  g.fillStyle = PALETTE.brass;
  for (const [bx, by] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) {
    g.globalAlpha = 0.55;
    g.fillRect(bx - 1.5, by - 1.5, 3, 3);
  }
  g.globalAlpha = 1;
  g.restore();
}

function paintDesk(g, tx, ty, px, py, isKeycard) {
  const width = 36;
  const height = 30;
  const x = px + 2;
  const y = py + 5;
  const wood = g.createLinearGradient(x, y, x, y + height);
  wood.addColorStop(0, PALETTE.deskTop);
  wood.addColorStop(1, '#2c1f2b');
  g.fillStyle = wood;
  rounded(g, x, y, width, height, 3);
  g.fill();
  g.strokeStyle = 'rgba(20, 12, 20, 0.85)';
  g.lineWidth = 1.4;
  g.stroke();
  g.strokeStyle = 'rgba(190, 148, 196, 0.22)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + 3, y + 1.5);
  g.lineTo(x + width - 3, y + 1.5);
  g.stroke();
  // Papers left out on the desk.
  const papers = 2 + Math.round(hash2(tx, ty, 101) * 2);
  for (let paper = 0; paper < papers; paper += 1) {
    const paperX = x + 5 + hash2(tx, ty, paper + 111) * 20;
    const paperY = y + 5 + hash2(tx, ty, paper + 121) * 16;
    g.save();
    g.translate(paperX, paperY);
    g.rotate((hash2(tx, ty, paper + 131) - 0.5) * 0.5);
    g.fillStyle = 'rgba(238, 226, 198, 0.82)';
    g.fillRect(0, 0, 9, 6);
    g.fillStyle = 'rgba(90, 80, 70, 0.35)';
    g.fillRect(1.5, 2, 6, 0.7);
    g.fillRect(1.5, 3.8, 4, 0.7);
    g.restore();
  }
  // A brass reading lamp on some desks, the room's small warm company.
  if (hash2(tx, ty, 141) > 0.52) {
    g.fillStyle = 'rgba(16, 30, 24, 0.9)';
    rounded(g, x + width - 13, y + 4, 9, 6, 2);
    g.fill();
    g.fillStyle = 'rgba(79, 227, 163, 0.35)';
    rounded(g, x + width - 12, y + 5.5, 7, 3, 1.5);
    g.fill();
    g.fillStyle = PALETTE.brass;
    g.fillRect(x + width - 9.5, y + 10, 2, 4);
  }
  if (isKeycard) {
    g.fillStyle = 'rgba(24, 18, 26, 0.9)';
    rounded(g, x + 7, y + 9, 22, 13, 2);
    g.fill();
    g.strokeStyle = 'rgba(201, 160, 99, 0.7)';
    g.lineWidth = 1;
    g.stroke();
  }
}

/** Warm pools from the ceiling lamps, with a slow, small flicker. */
function drawFloorLight(ctx, world, ui) {
  const time = ui.time;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  world.level.lamps.forEach(([tx, ty, radius], index) => {
    const cx = tx * TILE;
    const cy = ty * TILE;
    const flicker = 0.92 + Math.sin(time * 2.1 + index * 1.7) * 0.045 + Math.sin(time * 7.3 + index) * 0.015;
    const reach = radius * TILE * flicker;
    const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, reach);
    glow.addColorStop(0, 'rgba(255, 196, 128, 0.15)');
    glow.addColorStop(0.45, 'rgba(255, 178, 108, 0.075)');
    glow.addColorStop(1, 'rgba(255, 160, 90, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, reach, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 214, 158, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(201, 160, 99, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

function drawCone(ctx, world, guard) {
  const shape = coneShape(guard);
  const eyeX = guard.x + Math.cos(guard.facing) * 9;
  const eyeY = guard.y + Math.sin(guard.facing) * 9;
  const rays = 30;
  const points = [];
  for (let ray = 0; ray <= rays; ray += 1) {
    const angle = guard.facing - shape.halfAngle + (shape.halfAngle * 2 * ray) / rays;
    const reach = rayReach(world.grid, eyeX, eyeY, angle, shape.range);
    points.push({ x: eyeX + Math.cos(angle) * reach, y: eyeY + Math.sin(angle) * reach, angle, reach });
  }
  const rgb = CONE_RGB[guard.state];
  const glow = ctx.createRadialGradient(eyeX, eyeY, 10, eyeX, eyeY, shape.range);
  glow.addColorStop(0, `rgba(${rgb}, 0.34)`);
  glow.addColorStop(0.5, `rgba(${rgb}, 0.15)`);
  glow.addColorStop(0.85, `rgba(${rgb}, 0.05)`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.moveTo(eyeX, eyeY);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = `rgba(${rgb}, ${guard.state === 'alert' ? 0.5 : 0.3})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb}, 0.16)`;
  ctx.beginPath();
  ctx.moveTo(eyeX, eyeY);
  ctx.lineTo(points[0].x, points[0].y);
  ctx.moveTo(eyeX, eyeY);
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.stroke();
  ctx.restore();

  if (guard.flash > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255, 236, 214, ${guard.flash * 0.34})`;
    ctx.beginPath();
    ctx.moveTo(eyeX, eyeY);
    for (const point of points) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The torch itself.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const torch = ctx.createRadialGradient(eyeX, eyeY, 1, eyeX, eyeY, 26);
  torch.addColorStop(0, `rgba(${rgb}, 0.75)`);
  torch.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = torch;
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCones(ctx, world, ui) {
  for (const guard of world.guards) drawCone(ctx, world, guard, ui);
}

function drawGuard(ctx, world, guard, ui) {
  const bob = Math.sin(world.time * (guard.state === 'alert' ? 11 : 6.2) + guard.id * 2) * 0.9;
  ctx.save();
  ctx.translate(guard.x, guard.y + bob);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(2, 8, 14, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(guard.facing);
  // Greatcoat and shoulders.
  const coat = ctx.createLinearGradient(-12, 0, 12, 0);
  coat.addColorStop(0, '#131c2b');
  coat.addColorStop(0.5, '#22304a');
  coat.addColorStop(1, '#182337');
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 13, 10.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8, 12, 20, 0.9)';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // The cap and the head under it.
  ctx.fillStyle = guard.state === 'alert' ? '#8e2c36' : '#2b3a55';
  ctx.beginPath();
  ctx.arc(4.5, 0, 6.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = guard.state === 'alert' ? '#c5414d' : '#3d5278';
  ctx.beginPath();
  ctx.arc(4.5, 0, 6.8, -0.9, 0.9);
  ctx.fill();
  ctx.fillStyle = '#b98d63';
  ctx.beginPath();
  ctx.arc(7.5, 0, 3.6, -1.1, 1.1);
  ctx.fill();

  // Torch arm held out into the dark.
  ctx.strokeStyle = '#1b2536';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(2, 7);
  ctx.lineTo(11, 10);
  ctx.stroke();
  ctx.fillStyle = '#c9a063';
  ctx.fillRect(11, 8.5, 5.5, 3.4);
  ctx.fillStyle = '#ffe4b0';
  ctx.beginPath();
  ctx.arc(17.5, 10.2, 2.1, 0, Math.PI * 2);
  ctx.fill();

  // Brass buttons and belt.
  ctx.fillStyle = 'rgba(201, 160, 99, 0.8)';
  ctx.beginPath();
  ctx.arc(-3, -4, 1.1, 0, Math.PI * 2);
  ctx.arc(-3, 4, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(201, 160, 99, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(-6, 9);
  ctx.stroke();
  ctx.restore();

  // Detection meter, a small arc of growing worry.
  if (guard.meter > 0.02 || world.alarm.raised) {
    const meter = Math.max(guard.meter, world.alarm.raised ? 1 : 0);
    ctx.strokeStyle = 'rgba(10, 14, 22, 0.85)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, -27, 11, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.strokeStyle = meter > 0.72 ? PALETTE.red : PALETTE.amber;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, -27, 11, Math.PI * 1.85, Math.PI * 1.85 + Math.PI * 0.7 * Math.min(1, meter));
    ctx.stroke();
  }

  if (guard.state !== 'patrol') {
    ctx.fillStyle = guard.state === 'alert' ? PALETTE.red : PALETTE.amber;
    ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = guard.state === 'alert' ? 'rgba(255, 80, 90, 0.9)' : 'rgba(255, 180, 87, 0.9)';
    ctx.shadowBlur = 8;
    ctx.fillText(guard.state === 'alert' ? '!' : '?', 0, -43);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawPlayer(ctx, world, ui) {
  const player = world.player;
  const crouch = player.crouchAmount;
  const bob = player.moving ? Math.sin(world.time * 10) * 0.9 : Math.sin(world.time * 2.2) * 0.4;
  ctx.save();
  ctx.translate(player.x, player.y + bob);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(1, 8, 12, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // The scarf, trailing where the Moth has been.
  if (player.scarf.length > 1) {
    for (let index = 1; index < player.scarf.length; index += 1) {
      const past = player.scarf[index];
      const before = player.scarf[index - 1];
      const t = index / player.scarf.length;
      ctx.strokeStyle = `rgba(239, 227, 198, ${0.1 + t * 0.3})`;
      ctx.lineWidth = 1.5 + t * 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(before.x - player.x, before.y - player.y);
      ctx.lineTo(past.x - player.x, past.y - player.y);
      ctx.stroke();
    }
  }

  if (player.crouch) {
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(160, 200, 230, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 2, 16 + crouch * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.rotate(player.facing);
  ctx.scale(1, 1 - crouch * 0.12);
  // Cloak.
  const cloak = ctx.createLinearGradient(-11, 0, 10, 0);
  cloak.addColorStop(0, '#0e1622');
  cloak.addColorStop(0.55, '#22324d');
  cloak.addColorStop(1, '#121b2b');
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 11.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  // Satchel.
  ctx.fillStyle = '#5a4230';
  rounded(ctx, -9, -2.4, 6.5, 6, 1.6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(201, 160, 99, 0.5)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-8, -0.5);
  ctx.lineTo(-3.5, 2.5);
  ctx.stroke();
  // Hood.
  ctx.fillStyle = '#2c3f5e';
  ctx.beginPath();
  ctx.arc(3, 0, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b111c';
  ctx.beginPath();
  ctx.arc(5.6, 0, 4.6, -1.25, 1.25);
  ctx.fill();
  // Scarf at the throat.
  ctx.strokeStyle = PALETTE.cream;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(1.6, 0, 6.4, 2.2, 4.1);
  ctx.stroke();
  ctx.fillStyle = PALETTE.cream;
  ctx.beginPath();
  ctx.arc(-2.4, -6.4, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // The pebble in hand and where it would go.
  const pointer = ui.pointer;
  if (pointer && pointer.inside && world.status === SCREEN.PLAY) {
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    const span = Math.hypot(dx, dy) || 1;
    const reach = Math.min(span, 240);
    const tx = player.x + (dx / span) * reach;
    const ty = player.y + (dy / span) * reach;
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 227, 198, 0.24)';
    ctx.setLineDash([2, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(player.x + (dx / span) * 16, player.y + (dy / span) * 16);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(239, 227, 198, 0.65)';
    ctx.beginPath();
    ctx.arc(tx, ty, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(239, 227, 198, 0.22)';
    ctx.beginPath();
    ctx.arc(tx, ty, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawKeycard(ctx, world, ui) {
  if (world.keycard.taken) return;
  const time = ui.time;
  const bob = Math.sin(time * 2.6) * 1.8;
  const x = world.keycard.x;
  const y = world.keycard.y - 8 + bob;
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 54);
  glow.addColorStop(0, 'rgba(255, 209, 102, 0.4)');
  glow.addColorStop(0.45, 'rgba(255, 196, 88, 0.13)');
  glow.addColorStop(1, 'rgba(255, 196, 88, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 54, 0, Math.PI * 2);
  ctx.fill();

  const pulse = 0.5 + Math.sin(time * 3) * 0.5;
  ctx.strokeStyle = `rgba(255, 209, 102, ${0.16 + pulse * 0.22})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 20 + pulse * 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(x, y);
  ctx.rotate(-0.22);
  ctx.fillStyle = '#3a2c12';
  rounded(ctx, -11, -7, 22, 14, 2.5);
  ctx.fill();
  const gold = ctx.createLinearGradient(-10, -7, 10, 7);
  gold.addColorStop(0, '#ffe9a8');
  gold.addColorStop(0.5, '#ffd166');
  gold.addColorStop(1, '#c9962f');
  ctx.fillStyle = gold;
  rounded(ctx, -10, -6, 20, 12, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(58, 44, 18, 0.8)';
  ctx.fillRect(-7, -3.2, 8, 1.8);
  ctx.fillStyle = 'rgba(255, 249, 220, 0.9)';
  ctx.fillRect(2.5, -3.5, 4.5, 3);
  ctx.strokeStyle = 'rgba(255, 250, 225, 0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-7, 2);
  ctx.lineTo(6, 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 224, 150, 0.9)';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('KEYCARD', x, y - 26);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

function drawExit(ctx, world, ui) {
  const time = ui.time;
  const grid = world.grid;
  const tileX = Math.floor(world.exit.x / TILE);
  const tileY = Math.floor(world.exit.y / TILE);
  const open = world.keycard.taken;
  const pulse = 0.5 + Math.sin(time * 2.4) * 0.5;
  const strength = open ? 0.65 + pulse * 0.35 : 0.28;

  // The doorway is cut into the west wall, one tile from the exit pad.
  const doorTop = tileY * TILE + 4;
  ctx.save();
  ctx.fillStyle = '#0a1a15';
  rounded(ctx, 4, doorTop, 30, TILE - 8, 3);
  ctx.fill();
  ctx.strokeStyle = `rgba(79, 227, 163, ${0.35 + strength * 0.5})`;
  ctx.lineWidth = 2;
  rounded(ctx, 5, doorTop + 1, 28, TILE - 10, 3);
  ctx.stroke();
  ctx.fillStyle = `rgba(79, 227, 163, ${0.12 + strength * 0.3})`;
  ctx.fillRect(10, doorTop + 5, 18, TILE - 18);
  ctx.strokeStyle = `rgba(160, 255, 214, ${strength * 0.9})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(14, doorTop + TILE / 2 - 6);
  ctx.lineTo(22, doorTop + TILE / 2);
  ctx.lineTo(14, doorTop + TILE / 2 + 6);
  ctx.stroke();
  if (!open) {
    ctx.fillStyle = '#ff5a63';
    ctx.beginPath();
    ctx.arc(19, doorTop + TILE - 12, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(17.5, doorTop + TILE - 12, 3, 4.5);
  }
  ctx.restore();

  // Light spilling from the doorway onto the exit pad.
  const cx = world.exit.x;
  const cy = world.exit.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const spill = ctx.createRadialGradient(cx - 16, cy, 4, cx - 16, cy, 74);
  spill.addColorStop(0, `rgba(79, 227, 163, ${0.34 * strength + 0.1})`);
  spill.addColorStop(1, 'rgba(79, 227, 163, 0)');
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.arc(cx - 16, cy, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = `rgba(79, 227, 163, ${0.25 + strength * 0.45})`;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(tileX * TILE + 5, tileY * TILE + 5, TILE - 10, TILE - 10);
  for (let chevron = 0; chevron < 3; chevron += 1) {
    const offset = ((time * 26 + chevron * 12) % 34) - 6;
    ctx.strokeStyle = `rgba(79, 227, 163, ${(open ? 0.4 : 0.14) * (1 - chevron * 0.22)})`;
    ctx.beginPath();
    ctx.moveTo(tileX * TILE + 34 - offset, tileY * TILE + 12);
    ctx.lineTo(tileX * TILE + 26 - offset, tileY * TILE + 20);
    ctx.lineTo(tileX * TILE + 34 - offset, tileY * TILE + 28);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(140, 255, 203, ${open ? 0.85 : 0.45})`;
  ctx.font = '600 9px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
  ctx.fillText(open ? 'EXIT OPEN' : 'EXIT LOCKED', cx + 2, cy + 30);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

function drawPebbles(ctx, world) {
  for (const pebble of world.pebbles) {
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 227, 198, 0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pebble.x - pebble.vx * 0.018, pebble.y - pebble.vy * 0.018);
    ctx.lineTo(pebble.x, pebble.y);
    ctx.stroke();
    ctx.fillStyle = '#efe3c6';
    ctx.beginPath();
    ctx.arc(pebble.x, pebble.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEffects(ctx, world) {
  for (const effect of world.effects) {
    const t = Math.min(1, effect.age / effect.life);
    const radius = 4 + (effect.radius - 4) * Math.sqrt(t);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = effect.kind === 'step' ? 1 : 2 * (1 - t) + 0.6;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (effect.kind === 'pickup' || effect.kind === 'clatter') {
      ctx.globalAlpha = (1 - t) * 0.5;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (effect.kind === 'question' || effect.kind === 'alert') {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = effect.color;
      ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(effect.kind === 'question' ? '?' : '!', effect.x, effect.y - t * 14);
    }
    if (effect.kind === 'clatter') {
      for (let dot = 0; dot < 3; dot += 1) {
        const angle = (dot / 3) * Math.PI * 2 + effect.x;
        const distance = 6 + t * effect.radius * 0.4;
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.fillStyle = effect.color;
        ctx.beginPath();
        ctx.arc(effect.x + Math.cos(angle) * distance, effect.y + Math.sin(angle) * distance, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/** Vignette, alarm red, near-miss amber: the screen's own nerves. */
function drawAtmosphere(ctx, world, ui) {
  const vignette = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 280, VIEW.width / 2, VIEW.height / 2, 780);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  const pulse = 0.5 + Math.sin(ui.time * 6) * 0.5;
  if (world.alarm.raised) {
    const red = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 300, VIEW.width / 2, VIEW.height / 2, 760);
    red.addColorStop(0, 'rgba(255, 40, 60, 0)');
    red.addColorStop(1, `rgba(255, 40, 60, ${0.16 + pulse * 0.1})`);
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  if (world.nearMissPulse > 0) {
    const amber = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 300, VIEW.width / 2, VIEW.height / 2, 760);
    amber.addColorStop(0, 'rgba(255, 180, 87, 0)');
    amber.addColorStop(1, `rgba(255, 180, 87, ${world.nearMissPulse * 0.16})`);
    ctx.fillStyle = amber;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

/** The title's own painting: a lantern, a moth, and the dark around them. */
function drawTitleArt(ctx, world, ui) {
  const time = ui.time;
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  sky.addColorStop(0, '#070b14');
  sky.addColorStop(0.55, '#0b1421');
  sky.addColorStop(1, '#05080e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // A faint archive floor, far below.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = 'rgba(90, 120, 160, 0.13)';
  ctx.lineWidth = 1;
  for (let line = 0; line < 12; line += 1) {
    const y = 470 + line * 24;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.lineTo(VIEW.width + 40, y + 40);
    ctx.stroke();
  }
  ctx.restore();

  const lanternX = 884;
  const lanternY = 300;
  const sway = Math.sin(time * 0.8) * 3;
  const halo = ctx.createRadialGradient(lanternX + sway, lanternY, 20, lanternX + sway, lanternY, 360);
  halo.addColorStop(0, 'rgba(255, 206, 140, 0.34)');
  halo.addColorStop(0.35, 'rgba(255, 176, 94, 0.13)');
  halo.addColorStop(1, 'rgba(255, 160, 80, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(lanternX + sway, lanternY, 360, 0, Math.PI * 2);
  ctx.fill();

  // The chain and the lantern.
  ctx.save();
  ctx.translate(lanternX + sway, lanternY);
  ctx.strokeStyle = 'rgba(201, 160, 99, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -300);
  ctx.lineTo(0, -64);
  ctx.stroke();
  ctx.fillStyle = 'rgba(20, 26, 38, 0.9)';
  rounded(ctx, -34, -66, 68, 12, 4);
  ctx.fill();
  ctx.strokeStyle = PALETTE.brass;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const glass = ctx.createLinearGradient(-26, -54, 26, 44);
  glass.addColorStop(0, 'rgba(255, 226, 168, 0.92)');
  glass.addColorStop(0.5, 'rgba(255, 186, 106, 0.86)');
  glass.addColorStop(1, 'rgba(210, 128, 60, 0.8)');
  ctx.fillStyle = glass;
  rounded(ctx, -26, -54, 52, 98, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70, 46, 20, 0.65)';
  ctx.lineWidth = 2;
  rounded(ctx, -26, -54, 52, 98, 10);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90, 58, 24, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -52);
  ctx.lineTo(0, 42);
  ctx.moveTo(-24, -6);
  ctx.lineTo(24, -6);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 248, 214, 0.95)';
  ctx.beginPath();
  ctx.ellipse(0, -2, 5, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(24, 28, 40, 0.92)';
  rounded(ctx, -30, 44, 60, 9, 3);
  ctx.fill();
  ctx.restore();

  // The moth, circling what it should not love.
  const mothX = lanternX - 196 + Math.sin(time * 1.3) * 12;
  const mothY = lanternY - 96 + Math.cos(time * 1.7) * 8;
  ctx.save();
  ctx.translate(mothX, mothY);
  ctx.rotate(-0.3 + Math.sin(time * 1.1) * 0.08);
  const flutter = 0.72 + Math.sin(time * 9) * 0.12;
  ctx.fillStyle = 'rgba(239, 227, 198, 0.88)';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(18, -30 * flutter, 54, -34 * flutter, 60, -6);
    ctx.bezierCurveTo(64, 16, 30, 20, 4, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(120, 92, 58, 0.4)';
    ctx.beginPath();
    ctx.ellipse(34, -8, 8, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(239, 227, 198, 0.88)';
    ctx.beginPath();
    ctx.moveTo(2, 6);
    ctx.bezierCurveTo(16, 18, 34, 26, 30, 4);
    ctx.bezierCurveTo(24, -4, 10, -2, 2, 6);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#d9c9a4';
  ctx.beginPath();
  ctx.ellipse(0, 0, 4, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(239, 227, 198, 0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-1, -14);
  ctx.quadraticCurveTo(-12, -28, -18, -26);
  ctx.moveTo(1, -14);
  ctx.quadraticCurveTo(12, -28, 18, -26);
  ctx.stroke();
  ctx.restore();

  // Dust in the lamplight.
  for (let mote = 0; mote < 46; mote += 1) {
    const seed = hash2(mote, 7, 5);
    const drift = (time * (6 + seed * 10) + mote * 53) % 720;
    const x = 520 + hash2(mote, 3, 9) * 700 + Math.sin(time * 0.5 + mote) * 14;
    const y = 620 - drift;
    const alpha = 0.05 + hash2(mote, 11, 2) * 0.16;
    ctx.fillStyle = `rgba(255, 214, 150, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + hash2(mote, 5, 3) * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  void world;
}
