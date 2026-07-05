import type { Bird, Pig, Block, Particle, Vec2 } from "../types";
import { getGroundY } from "./physics";

// Sky gradient colors
const SKY_TOP = "#87CEEB";
const SKY_BOT = "#d4eeff";
const GROUND_COLOR = "#5d8a3c";
const DIRT_COLOR = "#8B6914";

export function renderScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  birds: Bird[],
  pigs: Pig[],
  blocks: Block[],
  particles: Particle[],
  slingshotX: number,
  slingshotY: number,
  dragPos: Vec2 | null,
  currentBirdIdx: number,
  isDragging: boolean,
  _dark: boolean
): void {
  ctx.clearRect(0, 0, w, h);

  drawBackground(ctx, w, h);
  drawSlingshot(ctx, slingshotX, slingshotY, w, h, birds, currentBirdIdx, dragPos, isDragging);
  drawBlocks(ctx, blocks);
  drawPigs(ctx, pigs);
  drawBirds(ctx, birds);
  drawParticles(ctx, particles);

  // Waiting birds queue (bottom left)
  drawBirdQueue(ctx, birds, currentBirdIdx, h);
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const groundY = getGroundY(h);

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_BOT);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, groundY);

  // Clouds
  drawCloud(ctx, w * 0.15, h * 0.12, 60);
  drawCloud(ctx, w * 0.45, h * 0.08, 80);
  drawCloud(ctx, w * 0.75, h * 0.14, 55);

  // Ground
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Dirt stripe
  ctx.fillStyle = DIRT_COLOR;
  ctx.fillRect(0, groundY, w, 12);

  // Grass tufts
  ctx.fillStyle = "#4a7a2a";
  for (let x = 0; x < w; x += 30) {
    const gx = x + Math.sin(x * 0.1) * 5;
    ctx.beginPath();
    ctx.moveTo(gx, groundY);
    ctx.lineTo(gx + 6, groundY - 10);
    ctx.lineTo(gx + 12, groundY);
    ctx.fill();
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.1, size * 0.35, 0, Math.PI * 2);
  ctx.arc(x - size * 0.35, y + size * 0.05, size * 0.3, 0, Math.PI * 2);
  ctx.arc(x + size * 0.7, y + size * 0.1, size * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSlingshot(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  _w: number,
  _h: number,
  birds: Bird[],
  currentBirdIdx: number,
  dragPos: Vec2 | null,
  isDragging: boolean
): void {
  // Fork arms
  ctx.save();
  ctx.strokeStyle = "#6b3a1f";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";

  // Left arm
  ctx.beginPath();
  ctx.moveTo(sx, sy + 40);
  ctx.lineTo(sx - 18, sy - 10);
  ctx.stroke();

  // Right arm
  ctx.beginPath();
  ctx.moveTo(sx, sy + 40);
  ctx.lineTo(sx + 18, sy - 10);
  ctx.stroke();

  // Trunk
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(sx, sy + 40);
  ctx.lineTo(sx, sy + 90);
  ctx.stroke();

  // Band
  const birdX = isDragging && dragPos ? dragPos.x : sx;
  const birdY = isDragging && dragPos ? dragPos.y : sy;
  const currentBird = birds[currentBirdIdx];
  const hasBird = currentBird && !currentBird.launched;

  if (hasBird) {
    ctx.strokeStyle = "#8B4513";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx - 18, sy - 10);
    ctx.lineTo(birdX, birdY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + 18, sy - 10);
    ctx.lineTo(birdX, birdY);
    ctx.stroke();
  }

  ctx.restore();

  // Draw current bird on slingshot
  if (hasBird && currentBird) {
    drawBirdShape(ctx, birdX, birdY, currentBird.radius, currentBird.type, 0);

    // Aim trajectory dots
    if (isDragging && dragPos) {
      const power = 4.5;
      const vx = (sx - dragPos.x) * power;
      const vy = (sy - dragPos.y) * power;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      let tx = birdX, ty = birdY, tvx = vx, tvy = vy;
      for (let i = 0; i < 25; i++) {
        const dt = 0.05;
        tvx *= 1;
        tvy += 800 * dt;
        tx += tvx * dt;
        ty += tvy * dt;
        const alpha = 1 - i / 25;
        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function drawBirdShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  type: Bird["type"],
  angle: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  switch (type) {
    case "red": {
      // Body
      const rg = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
      rg.addColorStop(0, "#ff6b6b");
      rg.addColorStop(1, "#c0392b");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.moveTo(r * 0.5, -r * 0.1);
      ctx.lineTo(r * 1.1, 0);
      ctx.lineTo(r * 0.5, r * 0.2);
      ctx.closePath();
      ctx.fill();
      // Eye
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(-r * 0.1, -r * 0.2, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(-r * 0.05, -r * 0.2, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Eyebrow (angry)
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.42);
      ctx.lineTo(r * 0.1, -r * 0.35);
      ctx.stroke();
      // Tuft
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r);
      ctx.lineTo(r * 0.15, -r * 1.35);
      ctx.lineTo(r * 0.35, -r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "blue": {
      const bg = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
      bg.addColorStop(0, "#74b9ff");
      bg.addColorStop(1, "#0984e3");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.moveTo(r * 0.5, -r * 0.05);
      ctx.lineTo(r * 1.0, 0);
      ctx.lineTo(r * 0.5, r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(-r * 0.05, -r * 0.2, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.4);
      ctx.lineTo(r * 0.15, -r * 0.32);
      ctx.stroke();
      break;
    }
    case "yellow": {
      // Triangle bird
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath();
      ctx.moveTo(r * 1.1, 0);
      ctx.lineTo(-r * 0.6, -r * 0.9);
      ctx.lineTo(-r * 0.6, r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#e67e22";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -r * 0.1);
      ctx.lineTo(r * 1.3, 0);
      ctx.lineTo(r * 0.9, r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(r * 0.1, -r * 0.25, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(r * 0.15, -r * 0.25, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "black": {
      const blg = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 0, 0, 0, r);
      blg.addColorStop(0, "#636e72");
      blg.addColorStop(1, "#1a1a2e");
      ctx.fillStyle = blg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e17055";
      ctx.beginPath();
      ctx.moveTo(r * 0.5, -r * 0.1);
      ctx.lineTo(r * 1.05, 0);
      ctx.lineTo(r * 0.5, r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(-r * 0.05, -r * 0.25, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(0, -r * 0.25, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Fuse
      ctx.strokeStyle = "#f39c12";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r * 0.3, -r * 1.4, r * 0.1, -r * 1.7);
      ctx.stroke();
      // Spark
      ctx.fillStyle = "#fdcb6e";
      ctx.beginPath();
      ctx.arc(r * 0.1, -r * 1.7, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawBirds(ctx: CanvasRenderingContext2D, birds: Bird[]): void {
  for (const b of birds) {
    if (!b.launched || b.dead) continue;

    // Trail
    for (let i = 0; i < b.trail.length; i++) {
      const t = b.trail[i];
      if (!t) continue;
      const alpha = (i / b.trail.length) * 0.4;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = birdTrailColor(b.type);
      ctx.beginPath();
      ctx.arc(t.x, t.y, b.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const angle = Math.atan2(b.vy, b.vx);
    drawBirdShape(ctx, b.x, b.y, b.radius, b.type, angle);
  }
}

function birdTrailColor(type: Bird["type"]): string {
  switch (type) {
    case "red": return "#ff6b6b";
    case "blue": return "#74b9ff";
    case "yellow": return "#f1c40f";
    case "black": return "#636e72";
  }
}

function drawPigs(ctx: CanvasRenderingContext2D, pigs: Pig[]): void {
  for (const p of pigs) {
    if (p.dead) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    const r = p.radius;
    const hpFrac = p.hp / p.maxHp;

    // Body
    const pg = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
    pg.addColorStop(0, hpFrac > 0.5 ? "#a8e063" : "#7ec850");
    pg.addColorStop(1, hpFrac > 0.5 ? "#5d8a3c" : "#4a7a2a");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = "#8BC34A";
    ctx.beginPath();
    ctx.ellipse(r * 0.2, r * 0.2, r * 0.4, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nostrils
    ctx.fillStyle = "#4a7a2a";
    ctx.beginPath();
    ctx.arc(r * 0.08, r * 0.22, r * 0.07, 0, Math.PI * 2);
    ctx.arc(r * 0.32, r * 0.22, r * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.15, r * 0.28, 0, Math.PI * 2);
    ctx.arc(r * 0.25, -r * 0.15, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(-r * 0.22, -r * 0.15, r * 0.15, 0, Math.PI * 2);
    ctx.arc(r * 0.28, -r * 0.15, r * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Damage cracks
    if (hpFrac < 0.6) {
      ctx.strokeStyle = "#4a7a2a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 0.5);
      ctx.lineTo(r * 0.2, r * 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.3, -r * 0.4);
      ctx.lineTo(r * 0.5, r * 0.2);
      ctx.stroke();
    }

    // Helmet (high hp pigs)
    if (p.maxHp >= 5) {
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.95, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawBlocks(ctx: CanvasRenderingContext2D, blocks: Block[]): void {
  for (const bl of blocks) {
    if (bl.dead) continue;
    ctx.save();
    ctx.translate(bl.x, bl.y);
    ctx.rotate(bl.angle);

    const hw = bl.w / 2;
    const hh = bl.h / 2;
    const hpFrac = bl.hp / bl.maxHp;

    let fillColor: string;
    let strokeColor: string;
    switch (bl.type) {
      case "wood":
        fillColor = hpFrac > 0.5 ? "#c8a96e" : "#a0784a";
        strokeColor = "#7a5230";
        break;
      case "stone":
        fillColor = hpFrac > 0.5 ? "#9e9e9e" : "#757575";
        strokeColor = "#555";
        break;
      case "ice":
        fillColor = hpFrac > 0.5 ? "rgba(170,212,245,0.85)" : "rgba(120,180,230,0.7)";
        strokeColor = "#6ab4e8";
        break;
    }

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(-hw + 3, -hh + 3, bl.w, bl.h);

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.fillRect(-hw, -hh, bl.w, bl.h);
    ctx.strokeRect(-hw, -hh, bl.w, bl.h);

    // Wood grain
    if (bl.type === "wood") {
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      for (let i = -hw + 10; i < hw; i += 10) {
        ctx.beginPath();
        ctx.moveTo(i, -hh);
        ctx.lineTo(i, hh);
        ctx.stroke();
      }
    }

    // Ice sheen
    if (bl.type === "ice") {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(-hw, -hh, bl.w * 0.3, bl.h);
    }

    // Damage cracks
    if (hpFrac < 0.5) {
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.5, -hh * 0.3);
      ctx.lineTo(hw * 0.3, hh * 0.6);
      ctx.moveTo(hw * 0.2, -hh * 0.7);
      ctx.lineTo(-hw * 0.1, hh * 0.4);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    if (p.life <= 0) continue;
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBirdQueue(
  ctx: CanvasRenderingContext2D,
  birds: Bird[],
  currentBirdIdx: number,
  h: number
): void {
  const startX = 30;
  const y = h - 40;
  let queueX = startX;

  for (let i = currentBirdIdx + 1; i < birds.length; i++) {
    const b = birds[i];
    if (!b) continue;
    const r = 14;
    drawBirdShape(ctx, queueX + r, y, r, b.type, 0);
    queueX += r * 2 + 8;
  }
}

export { drawBirdShape };
