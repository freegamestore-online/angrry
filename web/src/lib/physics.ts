import type { Bird, Pig, Block, Particle, Vec2 } from "../types";

const GRAVITY = 700;
const GROUND_Y_FRAC = 0.82; // fraction of canvas height
const DAMPING = 0.6;
const FRICTION = 0.88;

export function getGroundY(h: number): number {
  return h * GROUND_Y_FRAC;
}

export function stepPhysics(
  birds: Bird[],
  pigs: Pig[],
  blocks: Block[],
  particles: Particle[],
  dt: number,
  canvasW: number,
  canvasH: number
): void {
  const groundY = getGroundY(canvasH);

  // Update birds
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Ground collision
    if (b.y + b.radius >= groundY) {
      b.y = groundY - b.radius;
      b.vy *= -DAMPING;
      b.vx *= FRICTION;
      if (Math.abs(b.vy) < 30) b.dead = true;
    }
    // Out of bounds
    if (b.x > canvasW + 100 || b.y > canvasH + 100 || b.x < -200) {
      b.dead = true;
    }
    // Trail
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 20) b.trail.shift();
  }

  // Update pigs
  for (const p of pigs) {
    if (p.dead) continue;
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.vx * dt * 0.02;

    if (p.y + p.radius >= groundY) {
      p.y = groundY - p.radius;
      p.vy *= -DAMPING;
      p.vx *= FRICTION;
      if (Math.abs(p.vy) < 10) { p.vy = 0; p.vx *= 0.9; }
    }
    if (p.x < p.radius) { p.x = p.radius; p.vx *= -DAMPING; }
    if (p.x > canvasW - p.radius) { p.x = canvasW - p.radius; p.vx *= -DAMPING; }
  }

  // Update blocks
  for (const bl of blocks) {
    if (bl.dead) continue;
    bl.vy += GRAVITY * dt;
    bl.x += bl.vx * dt;
    bl.y += bl.vy * dt;
    bl.angle += bl.angularVel * dt;
    bl.angularVel *= 0.98;

    const halfH = bl.h / 2;
    if (bl.y + halfH >= groundY) {
      bl.y = groundY - halfH;
      bl.vy *= -DAMPING;
      bl.vx *= FRICTION;
      bl.angularVel *= 0.7;
      if (Math.abs(bl.vy) < 5) { bl.vy = 0; bl.vx *= 0.85; }
    }
    if (bl.x - bl.w / 2 < 0) { bl.x = bl.w / 2; bl.vx *= -DAMPING; }
    if (bl.x + bl.w / 2 > canvasW) { bl.x = canvasW - bl.w / 2; bl.vx *= -DAMPING; }
  }

  // Update particles
  for (const p of particles) {
    p.vy += GRAVITY * 0.3 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.y > groundY) { p.y = groundY; p.vy *= -0.3; }
  }

  // Bird vs Pig collisions
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    for (const p of pigs) {
      if (p.dead) continue;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = b.radius + p.radius;
      if (dist < minDist) {
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const damage = speed * 0.04;
        p.hp -= damage;
        if (p.hp <= 0) p.dead = true;
        // Knockback
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        p.vx += nx * speed * 0.5;
        p.vy += ny * speed * 0.5;
        b.vx *= 0.6;
        b.vy *= 0.6;
        spawnParticles(particles, p.x, p.y, "#a8e063", 6);
      }
    }
  }

  // Bird vs Block collisions
  for (const b of birds) {
    if (!b.launched || b.dead) continue;
    for (const bl of blocks) {
      if (bl.dead) continue;
      if (circleRectCollide(b.x, b.y, b.radius, bl)) {
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const dmgMult = bl.type === "stone" ? 0.015 : bl.type === "wood" ? 0.025 : 0.04;
        bl.hp -= speed * dmgMult;
        if (bl.hp <= 0) {
          bl.dead = true;
          spawnParticles(particles, bl.x, bl.y, blockColor(bl.type), 10);
        }
        b.vx *= 0.55;
        b.vy *= 0.55;
        bl.vx += b.vx * 0.3;
        bl.vy += b.vy * 0.3;
        bl.angularVel += (Math.random() - 0.5) * 4;
      }
    }
  }

  // Block vs Pig collisions
  for (const bl of blocks) {
    if (bl.dead) continue;
    for (const p of pigs) {
      if (p.dead) continue;
      if (circleRectCollide(p.x, p.y, p.radius, bl)) {
        const speed = Math.sqrt(bl.vx * bl.vx + bl.vy * bl.vy);
        p.hp -= speed * 0.02;
        if (p.hp <= 0) p.dead = true;
        const dx = p.x - bl.x;
        p.vx += dx > 0 ? speed * 0.4 : -speed * 0.4;
        p.vy -= speed * 0.2;
      }
    }
  }
}

function circleRectCollide(cx: number, cy: number, cr: number, bl: Block): boolean {
  // Axis-aligned approximation (ignore rotation for simplicity)
  const hw = bl.w / 2 + cr;
  const hh = bl.h / 2 + cr;
  return Math.abs(cx - bl.x) < hw && Math.abs(cy - bl.y) < hh;
}

function blockColor(type: Block["type"]): string {
  if (type === "wood") return "#c8a96e";
  if (type === "stone") return "#9e9e9e";
  return "#aad4f5";
}

export function spawnParticles(
  particles: Particle[],
  x: number,
  y: number,
  color: string,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 200;
    particles.push({
      id: Math.random(),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 100,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1,
      color,
      radius: 3 + Math.random() * 5,
    });
  }
}

export function isSettled(birds: Bird[], pigs: Pig[], blocks: Block[]): boolean {
  for (const b of birds) {
    if (b.launched && !b.dead) return false;
  }
  for (const p of pigs) {
    if (!p.dead && (Math.abs(p.vx) > 5 || Math.abs(p.vy) > 5)) return false;
  }
  for (const bl of blocks) {
    if (!bl.dead && (Math.abs(bl.vx) > 5 || Math.abs(bl.vy) > 5)) return false;
  }
  return true;
}

export function calcLaunchVelocity(
  slingshotX: number,
  slingshotY: number,
  dragX: number,
  dragY: number,
  power: number
): Vec2 {
  const dx = slingshotX - dragX;
  const dy = slingshotY - dragY;
  return { x: dx * power, y: dy * power };
}
