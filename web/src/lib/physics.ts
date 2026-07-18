import type { Bird, Pig, Block, Particle, Vec2 } from "../types";

const GRAVITY = 600;
const GROUND_Y_FRAC = 0.82;
// High damping = bouncy, low = dead stop
const BIRD_BOUNCE_DAMPING = 0.55;
const BIRD_FRICTION = 0.82;
// Pigs bounce a bit
const PIG_BOUNCE_DAMPING = 0.4;
const PIG_FRICTION = 0.78;
// Blocks
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
  // Direction is FROM drag point TOWARD slingshot, then past it
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
    const angle = (Math.random() * Math.PI * 2);
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

// Circle vs circle collision — returns overlap and normal
function circleCircle(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number
): { overlap: number; nx: number; ny: number } | null {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = ar + br;
  if (dist >= minDist || dist < 0.001) return null;
  const nx = dx / dist;
  const ny = dy / dist;
  return { overlap: minDist - dist, nx, ny };
}

// Axis-aligned bounding box vs circle
function aabbCircle(
  bx: number, by: number, bw: number, bh: number,
  cx: number, cy: number, cr: number
): { overlap: number; nx: number; ny: number } | null {
  const left = bx - bw / 2;
  const right = bx + bw / 2;
  const top = by - bh / 2;
  const bottom = by + bh / 2;

  const clampedX = Math.max(left, Math.min(right, cx));
  const clampedY = Math.max(top, Math.min(bottom, cy));

  const dx = cx - clampedX;
  const dy = cy - clampedY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= cr * cr || distSq < 0.001) return null;

  const dist = Math.sqrt(distSq);
  return {
    overlap: cr - dist,
    nx: dx / dist,
    ny: dy / dist,
  };
}

function resolveVelocities(
  aVx: number, aVy: number, aMass: number,
  bVx: number, bVy: number, bMass: number,
  nx: number, ny: number,
  restitution: number
): { avx: number; avy: number; bvx: number; bvy: number } {
  const relVx = aVx - bVx;
  const relVy = aVy - bVy;
  const velAlongNormal = relVx * nx + relVy * ny;
  if (velAlongNormal > 0) return { avx: aVx, avy: aVy, bvx: bVx, bvy: bVy };

  const j = -(1 + restitution) * velAlongNormal / (1 / aMass + 1 / bMass);
  return {
    avx: aVx + (j / aMass) * nx,
    avy: aVy + (j / aMass) * ny,
    bvx: bVx - (j / bMass) * nx,
    bvy: bVy - (j / bMass) * ny,
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

  // ── Birds ──
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Ground collision — only kill bird after it has slowed down significantly
    if (b.y + b.radius >= groundY) {
      b.y = groundY - b.radius;
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      b.vy *= -BIRD_BOUNCE_DAMPING;
      b.vx *= BIRD_FRICTION;
      // Only mark dead if truly slow (not just first bounce)
      if (speed < 60) {
        b.dead = true;
        spawnParticles(b.x, b.y, "#ff6600", 6, particles, nextId);
      }
    }

    // Out of bounds — generous margins so bird can travel full width
    if (b.x > canvasW + 300 || b.y > canvasH + 200 || b.x < -300) {
      b.dead = true;
    }

    // Trail
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 28) b.trail.shift();
  }

  // ── Pigs ──
  for (const p of pigs) {
    if (p.dead) continue;
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.vx * dt * 0.015;

    if (p.y + p.radius >= groundY) {
      p.y = groundY - p.radius;
      p.vy *= -PIG_BOUNCE_DAMPING;
      p.vx *= PIG_FRICTION;
      if (Math.abs(p.vy) < 8) p.vy = 0;
      if (Math.abs(p.vx) < 4) p.vx *= 0.8;
    }
    if (p.x < p.radius) { p.x = p.radius; p.vx = Math.abs(p.vx) * PIG_BOUNCE_DAMPING; }
    if (p.x > canvasW - p.radius) { p.x = canvasW - p.radius; p.vx = -Math.abs(p.vx) * PIG_BOUNCE_DAMPING; }
  }

  // ── Blocks ──
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
      if (Math.abs(bl.vy) < 5) bl.vy = 0;
      if (Math.abs(bl.vx) < 3) bl.vx *= 0.7;
    }
    if (bl.x - bl.w / 2 < 0) { bl.x = bl.w / 2; bl.vx = Math.abs(bl.vx) * BLOCK_BOUNCE_DAMPING; }
    if (bl.x + bl.w / 2 > canvasW) { bl.x = canvasW - bl.w / 2; bl.vx = -Math.abs(bl.vx) * BLOCK_BOUNCE_DAMPING; }
  }

  // ── Particles ──
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.life -= dt;
    p.vy += GRAVITY * 0.4 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // ── Bird vs Pig collisions ──
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    for (const p of pigs) {
      if (p.dead) continue;
      const col = circleCircle(b.x, b.y, b.radius, p.x, p.y, p.radius);
      if (!col) continue;

      // Push apart
      p.x += col.nx * col.overlap;
      p.y += col.ny * col.overlap;

      // Transfer momentum
      const bMass = b.radius * b.radius;
      const pMass = p.radius * p.radius;
      const res = resolveVelocities(b.vx, b.vy, bMass, p.vx, p.vy, pMass, col.nx, col.ny, 0.5);
      b.vx = res.avx; b.vy = res.avy;
      p.vx = res.bvx; p.vy = res.bvy;

      // Damage pig based on impact speed
      const impactSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const dmg = Math.max(1, Math.floor(impactSpeed / 180));
      p.hp -= dmg;
      if (p.hp <= 0) {
        p.dead = true;
        spawnParticles(p.x, p.y, "#44cc44", 12, particles, nextId);
      } else {
        spawnParticles(p.x, p.y, "#ffff00", 5, particles, nextId);
      }
    }
  }

  // ── Bird vs Block collisions ──
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    for (const bl of blocks) {
      if (bl.dead) continue;
      const col = aabbCircle(bl.x, bl.y, bl.w, bl.h, b.x, b.y, b.radius);
      if (!col) continue;

      // Push bird out
      b.x += col.nx * col.overlap;
      b.y += col.ny * col.overlap;

      const bMass = b.radius * b.radius;
      const blMass = (bl.w * bl.h) * (bl.type === "stone" ? 3 : bl.type === "wood" ? 2 : 1);
      const res = resolveVelocities(b.vx, b.vy, bMass, bl.vx, bl.vy, blMass, col.nx, col.ny, 0.3);
      b.vx = res.avx; b.vy = res.avy;
      bl.vx = res.bvx; bl.vy = res.bvy;
      bl.angularVel += (b.vx * 0.01);

      // Damage block
      const impactSpeed = Math.sqrt(
        (b.vx - bl.vx) * (b.vx - bl.vx) + (b.vy - bl.vy) * (b.vy - bl.vy)
      );
      const dmg = Math.max(1, Math.floor(impactSpeed / 200));
      bl.hp -= dmg;
      if (bl.hp <= 0) {
        bl.dead = true;
        const col2 = bl.type === "stone" ? "#888" : bl.type === "wood" ? "#a0522d" : "#aaddff";
        spawnParticles(bl.x, bl.y, col2, 10, particles, nextId);
      }
    }
  }

  // ── Block vs Pig collisions ──
  for (const bl of blocks) {
    if (bl.dead) continue;
    for (const p of pigs) {
      if (p.dead) continue;
      const col = aabbCircle(bl.x, bl.y, bl.w, bl.h, p.x, p.y, p.radius);
      if (!col) continue;

      p.x += col.nx * col.overlap * 0.5;
      p.y += col.ny * col.overlap * 0.5;
      bl.x -= col.nx * col.overlap * 0.5;
      bl.y -= col.ny * col.overlap * 0.5;

      const blMass = bl.w * bl.h * 0.5;
      const pMass = p.radius * p.radius;
      const res = resolveVelocities(bl.vx, bl.vy, blMass, p.vx, p.vy, pMass, col.nx, col.ny, 0.2);
      bl.vx = res.avx; bl.vy = res.avy;
      p.vx = res.bvx; p.vy = res.bvy;

      // Blocks can crush pigs
      const impactSpeed = Math.sqrt(
        (bl.vx - p.vx) * (bl.vx - p.vx) + (bl.vy - p.vy) * (bl.vy - p.vy)
      );
      if (impactSpeed > 120) {
        p.hp -= 1;
        if (p.hp <= 0) {
          p.dead = true;
          spawnParticles(p.x, p.y, "#44cc44", 12, particles, nextId);
        }
      }
    }
  }
}
