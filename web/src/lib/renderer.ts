import type { Bird, Pig, Block, Particle, Vec2 } from "../types";
import { getGroundY } from "./physics";

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
  drawBirdQueue(ctx, birds, currentBirdIdx, h);
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const groundY = getGroundY(h);

  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_BOT);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, groundY);

  drawCloud(ctx, w * 0.15, h * 0.12, 60);
  drawCloud(ctx, w * 0.45, h * 0.08, 80);
  drawCloud(ctx, w * 0.75, h * 0.14, 55);

  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, groundY, w, h - groundY);

  ctx.fillStyle = DIRT_COLOR;
  ctx.fillRect(0, groundY, w, 12);

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
  ctx.arc(x + size * 0.4, y + size * 0.1, size * 0.38, 0, Math.PI * 2);
  ctx.arc(x - size * 0.35, y + size * 0.1, size * 0.32, 0, Math.PI * 2);
  ctx.arc(x + size * 0.15, y + size * 0.25, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSlingshot(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  _w: number, h: number,
  birds: Bird[],
  currentBirdIdx: number,
  dragPos: Vec2 | null,
  isDragging: boolean
): void {
  const groundY = getGroundY(h);
  const forkH = sy - groundY + 60;
  const forkW = 22;

  // Slingshot pole
  ctx.save();
  ctx.strokeStyle = "#5c3a1e";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, groundY);
  ctx.lineTo(sx, sy + 10);
  ctx.stroke();

  // Left fork
  ctx.beginPath();
  ctx.moveTo(sx, sy + 10);
  ctx.lineTo(sx - forkW, sy - forkH * 0.3);
  ctx.stroke();

  // Right fork
  ctx.beginPath();
  ctx.moveTo(sx, sy + 10);
  ctx.lineTo(sx + forkW, sy - forkH * 0.3);
  ctx.stroke();
  ctx.restore();

  // Current bird on slingshot
  const currentBird = birds[currentBirdIdx];
  if (!currentBird || currentBird.launched) return;

  // Rubber bands
  const birdX = isDragging && dragPos ? dragPos.x : currentBird.x;
  const birdY = isDragging && dragPos ? dragPos.y : currentBird.y;

  const leftForkX = sx - forkW;
  const leftForkY = sy - forkH * 0.3;
  const rightForkX = sx + forkW;
  const rightForkY = sy - forkH * 0.3;

  ctx.save();
  ctx.strokeStyle = "#8B4513";
  ctx.lineWidth = 3;

  // Draw trajectory arc when dragging
  if (isDragging && dragPos) {
    const dx = sx - dragPos.x;
    const dy = sy - dragPos.y;
    const power = 7.5;
    const vx = dx * power;
    const vy = dy * power;

    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let tx = dragPos.x;
    let ty = dragPos.y;
    let tvx = vx;
    let tvy = vy;
    const tdt = 0.025;
    ctx.moveTo(tx, ty);
    for (let i = 0; i < 28; i++) {
      tvy += 600 * tdt;
      tx += tvx * tdt;
      ty += tvy * tdt;
      ctx.lineTo(tx, ty);
      if (ty > getGroundY(h)) break;
    }
    ctx.stroke();
    ctx.restore();
  }

  // Back band (behind bird)
  ctx.beginPath();
  ctx.moveTo(rightForkX, rightForkY);
  ctx.lineTo(birdX, birdY);
  ctx.stroke();

  // Draw bird
  drawBirdAt(ctx, currentBird.type, birdX, birdY, currentBird.radius, 0);

  // Front band (in front of bird)
  ctx.beginPath();
  ctx.moveTo(leftForkX, leftForkY);
  ctx.lineTo(birdX, birdY);
  ctx.stroke();
  ctx.restore();
}

function birdColor(type: string): string {
  switch (type) {
    case "red":    return "#e63030";
    case "blue":   return "#3090e6";
    case "yellow": return "#f0c020";
    case "black":  return "#333333";
    default:       return "#e63030";
  }
}

function drawBirdAt(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number, y: number,
  r: number,
  _angle: number
): void {
  const color = birdColor(type);

  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.9, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(-r * 0.25, -r * 0.25, r * 0.38, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(r * 0.3, -r * 0.15, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(r * 0.38, -r * 0.12, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#f5a623";
  ctx.beginPath();
  ctx.moveTo(r * 0.55, -r * 0.05);
  ctx.lineTo(r * 0.95, r * 0.05);
  ctx.lineTo(r * 0.55, r * 0.2);
  ctx.closePath();
  ctx.fill();

  // Eyebrow (angry)
  ctx.strokeStyle = "#111";
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(r * 0.1, -r * 0.42);
  ctx.lineTo(r * 0.55, -r * 0.32);
  ctx.stroke();

  // Type-specific features
  if (type === "yellow") {
    // Pointy head
    ctx.fillStyle = "#f0c020";
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r);
    ctx.lineTo(r * 0.4, -r * 0.5);
    ctx.lineTo(-r * 0.5, -r * 0.5);
    ctx.closePath();
    ctx.fill();
  } else if (type === "black") {
    // Fuse on top
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 0.3, -r * 1.4, -r * 0.3, -r * 1.6, r * 0.1, -r * 1.8);
    ctx.stroke();
    ctx.fillStyle = "#ff8800";
    ctx.beginPath();
    ctx.arc(r * 0.1, -r * 1.85, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "blue") {
    // Topknot
    ctx.fillStyle = "#3090e6";
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r);
    ctx.lineTo(r * 0.05, -r * 1.4);
    ctx.lineTo(r * 0.25, -r);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawBirds(ctx: CanvasRenderingContext2D, birds: Bird[]): void {
  for (const b of birds) {
    if (!b.launched || b.dead) continue;

    // Trail
    if (b.trail.length > 1) {
      ctx.save();
      for (let i = 1; i < b.trail.length; i++) {
        const t0 = b.trail[i - 1]!;
        const t1 = b.trail[i]!;
        const alpha = (i / b.trail.length) * 0.45;
        ctx.strokeStyle = `rgba(255,200,100,${alpha})`;
        ctx.lineWidth = b.radius * 0.6 * (i / b.trail.length);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    const angle = Math.atan2(b.vy, b.vx);
    drawBirdAt(ctx, b.type, b.x, b.y, b.radius, angle);
  }
}

function drawPigs(ctx: CanvasRenderingContext2D, pigs: Pig[]): void {
  for (const p of pigs) {
    if (p.dead) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, p.radius * 0.9, p.radius * 0.85, p.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Health tint
    const hpFrac = p.hp / p.maxHp;
    const g = Math.floor(120 + hpFrac * 80);
    ctx.fillStyle = `rgb(30,${g},30)`;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(-p.radius * 0.25, -p.radius * 0.25, p.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(-p.radius * 0.28, -p.radius * 0.1, p.radius * 0.3, 0, Math.PI * 2);
    ctx.arc(p.radius * 0.28, -p.radius * 0.1, p.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(-p.radius * 0.22, -p.radius * 0.08, p.radius * 0.14, 0, Math.PI * 2);
    ctx.arc(p.radius * 0.22, -p.radius * 0.08, p.radius * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = "#3aaa3a";
    ctx.beginPath();
    ctx.ellipse(0, p.radius * 0.25, p.radius * 0.35, p.radius * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(-p.radius * 0.12, p.radius * 0.25, p.radius * 0.07, 0, Math.PI * 2);
    ctx.arc(p.radius * 0.12, p.radius * 0.25, p.radius * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Damage cracks
    if (hpFrac < 0.7) {
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.radius * 0.1, -p.radius * 0.5);
      ctx.lineTo(p.radius * 0.3, p.radius * 0.1);
      ctx.moveTo(-p.radius * 0.2, -p.radius * 0.3);
      ctx.lineTo(-p.radius * 0.45, p.radius * 0.2);
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

    // Block color by type
    if (bl.type === "wood") {
      ctx.fillStyle = `rgb(${Math.floor(160 * hpFrac + 60)},${Math.floor(100 * hpFrac + 30)},20)`;
      ctx.strokeStyle = "#5c3a1e";
    } else if (bl.type === "stone") {
      const v = Math.floor(120 * hpFrac + 60);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.strokeStyle = "#444";
    } else {
      // ice
      ctx.fillStyle = `rgba(160,220,255,${0.4 + hpFrac * 0.5})`;
      ctx.strokeStyle = "#88ccff";
    }

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, bl.w, bl.h, 3);
    ctx.fill();
    ctx.stroke();

    // Wood grain
    if (bl.type === "wood") {
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      for (let i = -hh + 10; i < hh; i += 12) {
        ctx.beginPath();
        ctx.moveTo(-hw + 2, i);
        ctx.lineTo(hw - 2, i);
        ctx.stroke();
      }
    }

    // Crack overlay
    if (hpFrac < 0.6) {
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.3, -hh * 0.5);
      ctx.lineTo(hw * 0.2, hh * 0.3);
      ctx.moveTo(hw * 0.1, -hh * 0.6);
      ctx.lineTo(-hw * 0.4, hh * 0.4);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.radius * alpha), 0, Math.PI * 2);
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
  const groundY = getGroundY(h);
  const startX = 30;
  const queueY = groundY + 28;
  let drawn = 0;

  for (let i = currentBirdIdx + 1; i < birds.length; i++) {
    const b = birds[i];
    if (!b || b.dead) continue;
    const r = b.radius * 0.7;
    drawBirdAt(ctx, b.type, startX + drawn * (r * 2.5 + 4), queueY, r, 0);
    drawn++;
  }
}
