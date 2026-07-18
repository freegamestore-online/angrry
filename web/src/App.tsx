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

function buildLevel(levelIdx: number, canvasW: number, canvasH: number): GameState {
  const lvl = LEVELS[levelIdx] ?? LEVELS[0]!;
  const groundY = getGroundY(canvasH);
  const sx = canvasW * SLINGSHOT_X_FRAC;
  const sy = canvasH * SLINGSHOT_Y_FRAC;

  const birds: Bird[] = lvl.birds.map((type, i) =>
    makeBird(type, sx - i * 36, sy)
  );

  const pigs: Pig[] = lvl.pigs.map(p =>
    makePig(p.x * canvasW, p.y, p.hp, groundY)
  );

  const blocks: Block[] = lvl.blocks.map(b =>
    makeBlock(b.x * canvasW, b.y, b.w, b.h, b.type, b.angle ?? 0, groundY)
  );

  return {
    birds, pigs, blocks, particles: [],
    currentBirdIdx: 0,
    phase: "aiming",
    settleTimer: 0,
    score: 0,
    level: levelIdx,
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 450 });
  const [highScore, updateHighScore] = useHighScore("angrry_highscore");
  const stateRef = useRef<GameState | null>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState<GamePhase>("aiming");

  // Drag state
  const isDraggingRef = useRef(false);
  const dragPosRef = useRef<Vec2 | null>(null);

  // Resize canvas to fill container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (!e) return;
      const w = Math.floor(e.contentRect.width);
      const h = Math.floor(e.contentRect.height);
      setCanvasSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rebuild level when canvas size changes or on first mount
  const initLevel = useCallback((lvlIdx: number, w: number, h: number) => {
    stateRef.current = buildLevel(lvlIdx, w, h);
    setScore(0);
    setLevel(lvlIdx + 1);
    setPhase("aiming");
  }, []);

  useEffect(() => {
    if (canvasSize.w > 0 && canvasSize.h > 0) {
      const cur = stateRef.current;
      initLevel(cur ? cur.level : 0, canvasSize.w, canvasSize.h);
    }
  }, [canvasSize, initLevel]);

  // ── Game loop ──────────────────────────────────────────────────────────────
  const gameLoop = useCallback((dt: number) => {
    const gs = stateRef.current;
    const canvas = canvasRef.current;
    if (!gs || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = canvasSize;

    if (gs.phase === "aiming" || gs.phase === "flying" || gs.phase === "settling" || gs.phase === "nextbird") {
      stepPhysics(gs.birds, gs.pigs, gs.blocks, gs.particles, dt, w, h);

      // Bird-pig and bird-block collisions → damage
      const activeBird = gs.birds[gs.currentBirdIdx];
      if (activeBird && activeBird.launched && !activeBird.dead) {
        for (const pig of gs.pigs) {
          if (pig.dead) continue;
          const dx = pig.x - activeBird.x;
          const dy = pig.y - activeBird.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < pig.radius + activeBird.radius) {
            const dmg = 2 + Math.floor(Math.hypot(activeBird.vx, activeBird.vy) / 120);
            pig.hp -= dmg;
            if (pig.hp <= 0) {
              pig.dead = true;
              gs.score += 500;
              spawnParticles(pig.x, pig.y, "#7ec850", 14, gs.particles, nextId);
            } else {
              spawnParticles(pig.x, pig.y, "#b8e060", 6, gs.particles, nextId);
            }
            activeBird.dead = true;
          }
        }
        for (const bl of gs.blocks) {
          if (bl.dead) continue;
          const hw = bl.w / 2, hh = bl.h / 2;
          const dx = Math.abs(activeBird.x - bl.x) - hw;
          const dy = Math.abs(activeBird.y - bl.y) - hh;
          if (dx < activeBird.radius && dy < activeBird.radius) {
            const speed = Math.hypot(activeBird.vx, activeBird.vy);
            const dmg = 1 + Math.floor(speed / 150);
            bl.hp -= dmg;
            bl.vx += activeBird.vx * 0.3;
            bl.vy += activeBird.vy * 0.3;
            bl.angularVel += (Math.random() - 0.5) * 4;
            if (bl.hp <= 0) {
              bl.dead = true;
              gs.score += 100;
              const col = bl.type === "wood" ? "#c8a050" : bl.type === "stone" ? "#aaa" : "#88ddff";
              spawnParticles(bl.x, bl.y, col, 8, gs.particles, nextId);
            }
            activeBird.vx *= 0.4;
            activeBird.vy *= 0.4;
          }
        }
      }

      // Phase transitions
      if (gs.phase === "flying") {
        const bird = gs.birds[gs.currentBirdIdx];
        if (!bird || bird.dead) {
          gs.phase = "settling";
          gs.settleTimer = 0;
        }
      }

      if (gs.phase === "settling") {
        gs.settleTimer += dt;
        const allPigsDead = gs.pigs.every(p => p.dead);
        const settled = isSettled(gs.birds, gs.pigs, gs.blocks);

        if (allPigsDead || (settled && gs.settleTimer > 0.5)) {
          if (allPigsDead) {
            // Level clear — go straight to next level, no pop-up
            const nextLvl = gs.level + 1;
            const bonusBirds = gs.birds.filter(b => !b.launched).length;
            gs.score += bonusBirds * 1000;
            updateHighScore(gs.score);
            if (nextLvl < LEVELS.length) {
              // Immediately load next level, preserve score
              const prevScore = gs.score;
              stateRef.current = buildLevel(nextLvl, w, h);
              stateRef.current.score = prevScore;
              setScore(prevScore);
              setLevel(nextLvl + 1);
              setPhase("aiming");
            } else {
              // All levels done — loop back to level 1 with fresh score
              updateHighScore(gs.score);
              stateRef.current = buildLevel(0, w, h);
              setScore(0);
              setLevel(1);
              setPhase("aiming");
            }
            return;
          } else {
            // Bird used up, move to next bird
            const nextIdx = gs.currentBirdIdx + 1;
            if (nextIdx < gs.birds.length) {
              gs.currentBirdIdx = nextIdx;
              gs.phase = "aiming";
            } else {
              // Out of birds — game over
              gs.phase = "gameover";
              updateHighScore(gs.score);
            }
          }
        } else if (gs.settleTimer > SETTLE_TIME) {
          // Force next bird
          const nextIdx = gs.currentBirdIdx + 1;
          if (nextIdx < gs.birds.length) {
            gs.currentBirdIdx = nextIdx;
            gs.phase = "aiming";
          } else {
            gs.phase = "gameover";
            updateHighScore(gs.score);
          }
        }
      }

      setScore(gs.score);
      setPhase(gs.phase);
    }

    // Render
    const sx = w * SLINGSHOT_X_FRAC;
    const sy = h * SLINGSHOT_Y_FRAC;
    renderScene(
      ctx, w, h,
      gs.birds, gs.pigs, gs.blocks, gs.particles,
      sx, sy,
      isDraggingRef.current ? dragPosRef.current : null,
      gs.currentBirdIdx,
      isDraggingRef.current,
      false
    );
  }, [canvasSize, updateHighScore]);

  useGameLoop(gameLoop, phase === "gameover");

  // ── Input helpers ──────────────────────────────────────────────────────────
  const getCanvasPos = useCallback((clientX: number, clientY: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const startDrag = useCallback((pos: Vec2) => {
    const gs = stateRef.current;
    if (!gs || gs.phase !== "aiming") return;
    const { w, h } = canvasSize;
    const sx = w * SLINGSHOT_X_FRAC;
    const sy = h * SLINGSHOT_Y_FRAC;
    const dx = pos.x - sx;
    const dy = pos.y - sy;
    if (Math.sqrt(dx * dx + dy * dy) < 60) {
      isDraggingRef.current = true;
      dragPosRef.current = pos;
    }
  }, [canvasSize]);

  const moveDrag = useCallback((pos: Vec2) => {
    if (!isDraggingRef.current) return;
    const { w, h } = canvasSize;
    const sx = w * SLINGSHOT_X_FRAC;
    const sy = h * SLINGSHOT_Y_FRAC;
    const dx = pos.x - sx;
    const dy = pos.y - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_DRAG) {
      const scale = MAX_DRAG / dist;
      dragPosRef.current = { x: sx + dx * scale, y: sy + dy * scale };
    } else {
      dragPosRef.current = pos;
    }
  }, [canvasSize]);

  const endDrag = useCallback(() => {
    const gs = stateRef.current;
    if (!gs || !isDraggingRef.current || !dragPosRef.current) return;
    const { w, h } = canvasSize;
    const sx = w * SLINGSHOT_X_FRAC;
    const sy = h * SLINGSHOT_Y_FRAC;
    const bird = gs.birds[gs.currentBirdIdx];
    if (bird && !bird.launched) {
      const vel = calcLaunchVelocity(dragPosRef.current.x, dragPosRef.current.y, sx, sy, LAUNCH_POWER);
      bird.vx = vel.x;
      bird.vy = vel.y;
      bird.launched = true;
      bird.x = dragPosRef.current.x;
      bird.y = dragPosRef.current.y;
      gs.phase = "flying";
      setPhase("flying");
    }
    isDraggingRef.current = false;
    dragPosRef.current = null;
  }, [canvasSize]);

  // Mouse events
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    startDrag(getCanvasPos(e.clientX, e.clientY));
  }, [startDrag, getCanvasPos]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    moveDrag(getCanvasPos(e.clientX, e.clientY));
  }, [moveDrag, getCanvasPos]);

  const onMouseUp = useCallback(() => endDrag(), [endDrag]);

  // Touch events
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    if (t) startDrag(getCanvasPos(t.clientX, t.clientY));
  }, [startDrag, getCanvasPos]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    if (t) moveDrag(getCanvasPos(t.clientX, t.clientY));
  }, [moveDrag, getCanvasPos]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    endDrag();
  }, [endDrag]);

  const restart = useCallback(() => {
    initLevel(0, canvasSize.w, canvasSize.h);
  }, [initLevel, canvasSize]);

  return (
    <GameShell topbar={
      <GameTopbar
        title="Angry"
        score={score}
        highScore={highScore}
        extra={<span className="text-sm font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>Level {level}</span>}
      />
    }>
      <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-sky-300">
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="absolute inset-0 w-full h-full touch-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {/* Game Over overlay only */}
        {phase === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
              <p className="text-4xl" style={{ fontFamily: "Fraunces, serif" }}>Game Over</p>
              <p className="text-xl" style={{ fontFamily: "Manrope, sans-serif" }}>Score: {score}</p>
              <p className="text-sm text-gray-500" style={{ fontFamily: "Manrope, sans-serif" }}>Best: {highScore}</p>
              <button
                className="mt-2 px-8 py-3 rounded-xl bg-red-500 text-white text-lg font-bold hover:bg-red-600 active:scale-95 transition-all"
                style={{ fontFamily: "Manrope, sans-serif", minHeight: 44 }}
                onClick={restart}
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}
