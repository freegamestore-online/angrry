import type { Bird, Pig, Block, Particle, Vec2 } from "../types";

const GRAVITY = 600;
const GROUND_Y_FRAC = 0.82;
const BIRD_BOUNCE_DAMPING = 0.45;
const BIRD_FRICTION = 0.80;
const PIG_BOUNCE_DAMPING = 0.4;
const PIG_FRICTION = 0.78;
const BLOCK_BOUNCE_DAMPING = 0.35;
const BLOCK_FRICTION = 0.75;

export function getGroundY(h: number): number {
  return h * GROUND_Y_FRAC;
}

export function calcLaunchVelocity(
  dragX: number, dragY: number,
  slingshotX: number, slingshotY: number,
  power: number
): Vec2 {
  const dx = slingshotX - dragX;
  const dy = slingshotY - dragY;
  return { x: dx * power, y: dy * power };
}

export function spawnParticles(
  x: number, y: number,
  color: string,
  count: number,
  particles: Particle[],
  nextId: () => number
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 220;
    particles.push({
      id: nextId(),
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      life: 0.6 + Math.random() * 0.6,
      maxLife: 1.2,
      color,
      radius: 3 + Math.random() * 5,
    });
  }
}

export function isSettled(birds: Bird[], pigs: Pig[], blocks: Block[]): boolean {
  const activeBird = birds.find(b => b.launched && !b.dead);
  if (activeBird) return false;
  const movingPig = pigs.find(p => !p.dead && (Math.abs(p.vx) > 4 || Math.abs(p.vy) > 4));
  if (movingPig) return false;
  const movingBlock = blocks.find(b => !b.dead && (Math.abs(b.vx) > 4 || Math.abs(b.vy) > 4));
  if (movingBlock) return false;
  return true;
}

function circleCircle(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number
): { overlap: number; nx: number; ny: number } | null {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = ar + br;
  if (dist >= minDist || dist < 0.001) return null;
  return {
    overlap: minDist - dist,
    nx: dx / dist,
    ny: dy / dist,
  };
}

function circleRect(
  cx: number, cy: number, cr: number,
  rx: number, ry: number, rw: number, rh: number
): { overlap: number; nx: number; ny: number } | null {
  const halfW = rw / 2;
  const halfH = rh / 2;
  const clampedX = Math.max(rx - halfW, Math.min(rx + halfW, cx));
  const clampedY = Math.max(ry - halfH, Math.min(ry + halfH, cy));
  const dx = cx - clampedX;
  const dy = cy - clampedY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= cr || dist < 0.001) return null;
  return {
    overlap: cr - dist,
    nx: dx / dist,
    ny: dy / dist,
  };
}

export function stepPhysics(
  birds: Bird[],
  pigs: Pig[],
  blocks: Block[],
  particles: Particle[],
  dt: number,
  canvasW: number,
  canvasH: number,
  nextId: () => number
): void {
  const groundY = getGroundY(canvasH);

  // --- Update birds ---
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Ground collision
    if (b.y + b.radius >= groundY) {
      b.y = groundY - b.radius;
      b.vy *= -BIRD_BOUNCE_DAMPING;
      b.vx *= BIRD_FRICTION;
      if (Math.abs(b.vy) < 20) b.dead = true;
    }

    // Out of bounds
    if (b.x > canvasW + 150 || b.y > canvasH + 150 || b.x < -300) {
      b.dead = true;
    }

    // Trail
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 22) b.trail.shift();
  }

  // --- Update pigs ---
  for (const p of pigs) {
    if (p.dead) continue;
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.vx * dt * 0.02;

    if (p.y + p.radius >= groundY) {
      p.y = groundY - p.radius;
      p.vy *= -PIG_BOUNCE_DAMPING;
      p.vx *= PIG_FRICTION;
      if (Math.abs(p.vy) < 8) { p.vy = 0; p.vx *= 0.88; }
    }
    if (p.x < p.radius) { p.x = p.radius; p.vx = Math.abs(p.vx) * PIG_BOUNCE_DAMPING; }
    if (p.x > canvasW - p.radius) { p.x = canvasW - p.radius; p.vx = -Math.abs(p.vx) * PIG_BOUNCE_DAMPING; }
  }

  // --- Update blocks ---
  for (const bl of blocks) {
    if (bl.dead) continue;
    bl.vy += GRAVITY * dt;
    bl.x += bl.vx * dt;
    bl.y += bl.vy * dt;
    bl.angle += bl.angularVel * dt;
    bl.angularVel *= 0.97;

    const halfH = bl.h / 2;
    if (bl.y + halfH >= groundY) {
      bl.y = groundY - halfH;
      bl.vy *= -BLOCK_BOUNCE_DAMPING;
      bl.vx *= BLOCK_FRICTION;
      bl.angularVel *= 0.6;
      if (Math.abs(bl.vy) < 5) { bl.vy = 0; bl.vx *= 0.82; }
    }
  }

  // --- Update particles ---
  for (const p of particles) {
    p.vy += GRAVITY * 0.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  // Remove dead particles
  for (let i = particles.length - 1; i >= 0; i--) {
    if ((particles[i]?.life ?? 0) <= 0) particles.splice(i, 1);
  }

  // --- Bird vs Pig collisions ---
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    for (const p of pigs) {
      if (p.dead) continue;
      const col = circleCircle(b.x, b.y, b.radius, p.x, p.y, p.radius);
      if (!col) continue;

      const impact = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * 0.012;
      p.hp -= Math.max(1, impact);
      if (p.hp <= 0) {
        p.dead = true;
        spawnParticles(p.x, p.y, "#4ade80", 12, particles, nextId);
        spawnParticles(p.x, p.y, "#22c55e", 8, particles, nextId);
      } else {
        spawnParticles(p.x, p.y, "#fbbf24", 5, particles, nextId);
      }

      // Push pig
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      p.vx += col.nx * speed * 0.7;
      p.vy += col.ny * speed * 0.7 - 80;

      // Slow bird slightly
      b.vx *= 0.75;
      b.vy *= 0.75;
    }
  }

  // --- Bird vs Block collisions ---
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    for (const bl of blocks) {
      if (bl.dead) continue;
      const col = circleRect(b.x, b.y, b.radius, bl.x, bl.y, bl.w, bl.h);
      if (!col) continue;

      const impact = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * 0.01;
      bl.hp -= Math.max(0.5, impact);
      if (bl.hp <= 0) {
        bl.dead = true;
        const c = bl.type === "stone" ? "#9ca3af" : bl.type === "ice" ? "#7dd3fc" : "#a16207";
        spawnParticles(bl.x, bl.y, c, 10, particles, nextId);
      } else {
        const c = bl.type === "stone" ? "#d1d5db" : bl.type === "ice" ? "#bae6fd" : "#d97706";
        spawnParticles(b.x, b.y, c, 4, particles, nextId);
      }

      // Push block
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      bl.vx += col.nx * speed * 0.5;
      bl.vy += col.ny * speed * 0.5 - 50;
      bl.angularVel += (Math.random() - 0.5) * 8;

      // Deflect bird
      const dot = b.vx * col.nx + b.vy * col.ny;
      b.vx = (b.vx - 2 * dot * col.nx) * 0.5;
      b.vy = (b.vy - 2 * dot * col.ny) * 0.5;
    }
  }

  // --- Block vs Pig collisions ---
  for (const bl of blocks) {
    if (bl.dead) continue;
    for (const p of pigs) {
      if (p.dead) continue;
      const col = circleRect(p.x, p.y, p.radius, bl.x, bl.y, bl.w, bl.h);
      if (!col) continue;

      const impact = Math.sqrt(bl.vx * bl.vx + bl.vy * bl.vy) * 0.008;
      if (impact > 0.5) {
        p.hp -= impact;
        if (p.hp <= 0) {
          p.dead = true;
          spawnParticles(p.x, p.y, "#4ade80", 10, particles, nextId);
        }
      }

      // Separate
      p.x -= col.nx * col.overlap * 0.5;
      p.y -= col.ny * col.overlap * 0.5;
      bl.x += col.nx * col.overlap * 0.5;
      bl.y += col.ny * col.overlap * 0.5;

      const relVx = p.vx - bl.vx;
      const relVy = p.vy - bl.vy;
      const relV = relVx * col.nx + relVy * col.ny;
      if (relV < 0) {
        const imp = relV * 0.6;
        p.vx -= imp * col.nx;
        p.vy -= imp * col.ny;
        bl.vx += imp * col.nx;
        bl.vy += imp * col.ny;
      }
    }
  }
}
