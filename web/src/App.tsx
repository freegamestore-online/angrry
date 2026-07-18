import { GameShell, GameTopbar } from "@freegamestore/games";
import { useRef, useState, useCallback, useEffect } from "react";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import type { Bird, Pig, Block, Particle, Vec2, GamePhase, BirdType } from "./types";
import { stepPhysics, getGroundY, spawnParticles, isSettled, calcLaunchVelocity } from "./lib/physics";
import { renderScene } from "./lib/renderer";
import { LEVELS } from "./lib/levels";

let _nextId = 1;
function nextId(): number { return _nextId++; }

const SLINGSHOT_X_FRAC = 0.14;
const SLINGSHOT_Y_FRAC = 0.68;
const LAUNCH_POWER = 7.5;
const MAX_DRAG = 160;
const SETTLE_TIME = 2.8;

function makeBird(type: BirdType, x: number, y: number): Bird {
  const r = type === "blue" ? 14 : type === "yellow" ? 17 : type === "black" ? 22 : 18;
  return {
    id: nextId(), type, x, y, vx: 0, vy: 0,
    radius: r, launched: false, dead: false, trail: [], activated: false,
  };
}

function makePig(x: number, y: number, hp: number, groundY: number): Pig {
  const r = 22;
  return {
    id: nextId(), x, y: groundY - r, vx: 0, vy: 0,
    radius: r, hp, maxHp: hp, dead: false, angle: 0,
  };
}

function makeBlock(
  x: number, y: number, w: number, h: number,
  type: Block["type"], angle: number, groundY: number
): Block {
  const hp = type === "stone" ? 8 : type === "wood" ? 5 : 3;
  return {
    id: nextId(), x, y: groundY - h / 2,
    vx: 0, vy: 0, w, h, angle, angularVel: 0,
    hp, maxHp: hp, type, dead: false,
  };
}

interface GameState {
  birds: Bird[];
  pigs: Pig[];
  blocks: Block[];
  particles: Particle[];
  currentBirdIdx: number;
  phase: GamePhase;
  settleTimer: number;
  score: number;
  level: number;
}

function buildLevel(levelIdx: number, canvasW: number, canvasH: number, score: number): GameState {
  const lvl = LEVELS[levelIdx] ?? LEVELS[0]!;
  const groundY = getGroundY(canvasH);
  const sx = canvasW * SLINGSHOT_X_FRAC;
  const sy = canvasH * SLINGSHOT_Y_FRAC;

  const birds = lvl.birds.map((type, i) =>
    makeBird(type, sx - i * 30, sy)
  );

  const pigs = lvl.pigs.map(p =>
    makePig(p.x * canvasW, p.y, p.hp, groundY)
  );

  const blocks = lvl.blocks.map(b =>
    makeBlock(b.x * canvasW, b.y, b.w, b.h, b.type, b.angle ?? 0, groundY)
  );

  return {
    birds, pigs, blocks, particles: [],
    currentBirdIdx: 0,
    phase: "aiming",
    settleTimer: 0,
    score,
    level: levelIdx,
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, updateHighScore] = useHighScore("angrry_highscore");
  const [phase, setPhase] = useState<GamePhase>("aiming");
  const [level, setLevel] = useState(0);
  const sizeRef = useRef({ w: 800, h: 500 });

  // Drag state — pointer only, no re-renders
  const dragRef = useRef<{ active: boolean; pos: Vec2 | null }>({ active: false, pos: null });

  // Resize canvas to fill container
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w;
    canvas.height = h;
    sizeRef.current = { w, h };
    // Rebuild level at new size if state exists
    if (stateRef.current) {
      const s = stateRef.current;
      stateRef.current = buildLevel(s.level, w, h, s.score);
    }
  }, []);

  // Init
  useEffect(() => {
    resize();
    const obs = new ResizeObserver(resize);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [resize]);

  // Init game state once canvas is sized
  useEffect(() => {
    const { w, h } = sizeRef.current;
    if (w > 0 && h > 0 && !stateRef.current) {
      stateRef.current = buildLevel(0, w, h, 0);
    }
  }, []);

  // Slingshot position helpers
  function slingshotPos() {
    const { w, h } = sizeRef.current;
    return {
      sx: w * SLINGSHOT_X_FRAC,
      sy: h * SLINGSHOT_Y_FRAC,
    };
  }

  // Clamp drag to max distance from slingshot
  function clampDrag(px: number, py: number): Vec2 {
    const { sx, sy } = slingshotPos();
    const dx = px - sx;
    const dy = py - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= MAX_DRAG) return { x: px, y: py };
    return {
      x: sx + (dx / dist) * MAX_DRAG,
      y: sy + (dy / dist) * MAX_DRAG,
    };
  }

  // Check if pointer is near current bird on slingshot
  function nearBird(px: number, py: number): boolean {
    const s = stateRef.current;
    if (!s) return false;
    const bird = s.birds[s.currentBirdIdx];
    if (!bird || bird.launched) return false;
    const dx = px - bird.x;
    const dy = py - bird.y;
    return Math.sqrt(dx * dx + dy * dy) < bird.radius + 28;
  }

  // Pointer down
  const onPointerDown = useCallback((px: number, py: number) => {
    const s = stateRef.current;
    if (!s || s.phase !== "aiming") return;
    if (nearBird(px, py)) {
      dragRef.current.active = true;
      dragRef.current.pos = clampDrag(px, py);
    }
  }, []);

  // Pointer move
  const onPointerMove = useCallback((px: number, py: number) => {
    if (!dragRef.current.active) return;
    dragRef.current.pos = clampDrag(px, py);
  }, []);

  // Pointer up — launch!
  const onPointerUp = useCallback(() => {
    const s = stateRef.current;
    if (!s || !dragRef.current.active) return;
    dragRef.current.active = false;

    const drag = dragRef.current.pos;
    if (!drag) return;
    dragRef.current.pos = null;

    const bird = s.birds[s.currentBirdIdx];
    if (!bird || bird.launched) return;

    const { sx, sy } = slingshotPos();
    const vel = calcLaunchVelocity(drag.x, drag.y, sx, sy, LAUNCH_POWER);
    bird.vx = vel.x;
    bird.vy = vel.y;
    bird.launched = true;
    s.phase = "flying";
  }, []);

  // Touch / mouse event wiring
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getXY = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const md = (e: MouseEvent) => { const p = getXY(e); onPointerDown(p.x, p.y); };
    const mm = (e: MouseEvent) => { const p = getXY(e); onPointerMove(p.x, p.y); };
    const mu = () => onPointerUp();

    const td = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0]; if (!t) return;
      const p = getXY(t); onPointerDown(p.x, p.y);
    };
    const tm = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0]; if (!t) return;
      const p = getXY(t); onPointerMove(p.x, p.y);
    };
    const tu = (e: TouchEvent) => { e.preventDefault(); onPointerUp(); };

    canvas.addEventListener("mousedown", md);
    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("mouseup", mu);
    canvas.addEventListener("touchstart", td, { passive: false });
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchend", tu, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", md);
      canvas.removeEventListener("mousemove", mm);
      canvas.removeEventListener("mouseup", mu);
      canvas.removeEventListener("touchstart", td);
      canvas.removeEventListener("touchmove", tm);
      canvas.removeEventListener("touchend", tu);
    };
  }, [onPointerDown, onPointerMove, onPointerUp]);

  // Special ability on tap during flight
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const activate = () => {
      const s = stateRef.current;
      if (!s || s.phase !== "flying") return;
      const bird = s.birds[s.currentBirdIdx];
      if (!bird || !bird.launched || bird.dead || bird.activated) return;
      bird.activated = true;
      if (bird.type === "yellow") {
        bird.vx *= 1.8;
        bird.vy *= 0.5;
      } else if (bird.type === "black") {
        // Explode
        spawnParticles(bird.x, bird.y, "#ff6600", 20, s.particles, nextId);
        spawnParticles(bird.x, bird.y, "#ffcc00", 15, s.particles, nextId);
        const blastR = 90;
        for (const p of s.pigs) {
          if (p.dead) continue;
          const dx = p.x - bird.x; const dy = p.y - bird.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < blastR) {
            const force = (1 - d / blastR) * 800;
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force - 200;
            p.hp -= 3;
            if (p.hp <= 0) p.dead = true;
          }
        }
        for (const bl of s.blocks) {
          if (bl.dead) continue;
          const dx = bl.x - bird.x; const dy = bl.y - bird.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < blastR) {
            const force = (1 - d / blastR) * 600;
            bl.vx += (dx / d) * force;
            bl.vy += (dy / d) * force - 150;
            bl.angularVel += (Math.random() - 0.5) * 10;
            bl.hp -= 3;
            if (bl.hp <= 0) bl.dead = true;
          }
        }
        bird.dead = true;
      } else if (bird.type === "blue") {
        // Split into 3
        const offsets = [-25, 0, 25];
        for (const off of offsets) {
          const nb = makeBird("blue", bird.x, bird.y);
          nb.launched = true;
          nb.vx = bird.vx * 0.9;
          nb.vy = bird.vy + off;
          nb.activated = true;
          s.birds.splice(s.currentBirdIdx + 1, 0, nb);
        }
        bird.dead = true;
      }
    };

    const mc = () => activate();
    const tc = (e: TouchEvent) => { e.preventDefault(); activate(); };
    canvas.addEventListener("click", mc);
    canvas.addEventListener("touchend", tc, { passive: false });
    return () => {
      canvas.removeEventListener("click", mc);
      canvas.removeEventListener("touchend", tc);
    };
  }, []);

  // MAIN GAME LOOP — never paused
  useGameLoop((dt: number) => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = sizeRef.current;

    // --- UPDATE ---
    if (s.phase === "flying" || s.phase === "settling") {
      stepPhysics(s.birds, s.pigs, s.blocks, s.particles, dt, w, h, nextId);

      // Check if flying bird has died → next bird or settle
      if (s.phase === "flying") {
        const activeBird = s.birds[s.currentBirdIdx];
        if (!activeBird || !activeBird.launched || activeBird.dead) {
          // Look for any unlaunched bird
          const nextIdx = s.birds.findIndex((b, i) => i > s.currentBirdIdx && !b.launched);
          if (nextIdx !== -1) {
            s.currentBirdIdx = nextIdx;
            // Reposition next bird at slingshot
            const nb = s.birds[nextIdx]!;
            nb.x = w * SLINGSHOT_X_FRAC;
            nb.y = h * SLINGSHOT_Y_FRAC;
          }
          s.phase = "settling";
          s.settleTimer = 0;
        }
      }

      if (s.phase === "settling") {
        s.settleTimer += dt;
        const allPigsDead = s.pigs.every(p => p.dead);

        if (allPigsDead || s.settleTimer > SETTLE_TIME || isSettled(s.birds, s.pigs, s.blocks)) {
          if (allPigsDead) {
            // Bonus for remaining birds
            const remaining = s.birds.filter(b => !b.launched).length;
            s.score += remaining * 1000 + 3000;
            updateHighScore(s.score);
            setScore(s.score);

            // Advance to next level immediately — no pop-up
            const nextLevel = s.level + 1;
            if (nextLevel < LEVELS.length) {
              const next = buildLevel(nextLevel, w, h, s.score);
              stateRef.current = next;
              setLevel(nextLevel);
              setPhase("aiming");
            } else {
              // All levels done — loop back to level 0
              const next = buildLevel(0, w, h, s.score);
              stateRef.current = next;
              setLevel(0);
              setPhase("aiming");
            }
            return;
          } else {
            // Out of birds or time — check if any pigs alive
            const pigsAlive = s.pigs.some(p => !p.dead);
            if (pigsAlive) {
              // Check if we have birds left
              const birdsLeft = s.birds.some(b => !b.launched);
              if (birdsLeft) {
                // Still have birds — keep aiming
                s.phase = "aiming";
                setPhase("aiming");
              } else {
                // No birds left — game over
                s.phase = "gameover";
                setPhase("gameover");
                updateHighScore(s.score);
              }
            } else {
              // All pigs dead (caught by settle)
              const remaining = s.birds.filter(b => !b.launched).length;
              s.score += remaining * 1000 + 3000;
              updateHighScore(s.score);
              setScore(s.score);

              const nextLevel = s.level + 1;
              if (nextLevel < LEVELS.length) {
                const next = buildLevel(nextLevel, w, h, s.score);
                stateRef.current = next;
                setLevel(nextLevel);
                setPhase("aiming");
              } else {
                const next = buildLevel(0, w, h, s.score);
                stateRef.current = next;
                setLevel(0);
                setPhase("aiming");
              }
              return;
            }
          }
        }
      }
    }

    // Update score display
    if (s.score !== score) setScore(s.score);

    // --- RENDER ---
    const { sx, sy } = (() => ({
      sx: w * SLINGSHOT_X_FRAC,
      sy: h * SLINGSHOT_Y_FRAC,
    }))();

    renderScene(
      ctx, w, h,
      s.birds, s.pigs, s.blocks, s.particles,
      sx, sy,
      dragRef.current.pos,
      s.currentBirdIdx,
      dragRef.current.active,
      false
    );
  });

  const restart = useCallback(() => {
    const { w, h } = sizeRef.current;
    stateRef.current = buildLevel(0, w, h, 0);
    setScore(0);
    setLevel(0);
    setPhase("aiming");
  }, []);

  return (
    <GameShell topbar={
      <GameTopbar
        title="Angry Birds"
        score={score}
        highScore={highScore}
        level={level + 1}
      />
    }>
      <div ref={containerRef} className="relative w-full h-full overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

        {/* Game Over overlay */}
        {phase === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <p className="font-display text-4xl text-white mb-2">Game Over</p>
            <p className="text-white/80 mb-6 font-sans">Score: {score}</p>
            <button
              className="px-8 py-3 bg-red-500 hover:bg-red-400 text-white rounded-2xl font-sans text-lg font-bold"
              onClick={restart}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
