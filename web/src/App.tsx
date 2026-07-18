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
    makeBird(type, sx - i * 28, sy)
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
  const stateRef = useRef<GameState | null>(null);
  const dragRef = useRef<Vec2 | null>(null);
  const isDraggingRef = useRef(false);
  const [score, setScore] = useState(0);
  const [highScore, updateHighScore] = useHighScore("angrry_hs");
  const [phase, setPhase] = useState<GamePhase>("aiming");
  const [level, setLevel] = useState(0);

  const initLevel = useCallback((lvlIdx: number, currentScore: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gs = buildLevel(lvlIdx, canvas.width, canvas.height, currentScore);
    stateRef.current = gs;
    setPhase(gs.phase);
    setLevel(lvlIdx);
    setScore(currentScore);
  }, []);

  // Init on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const gs = stateRef.current;
      initLevel(gs ? gs.level : 0, gs ? gs.score : 0);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [initLevel]);

  // Input helpers
  const getCanvasPos = useCallback((clientX: number, clientY: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const slingshotPos = useCallback((): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return {
      x: canvas.width * SLINGSHOT_X_FRAC,
      y: canvas.height * SLINGSHOT_Y_FRAC,
    };
  }, []);

  const handlePointerDown = useCallback((clientX: number, clientY: number) => {
    const gs = stateRef.current;
    if (!gs || gs.phase !== "aiming") return;
    const pos = getCanvasPos(clientX, clientY);
    const sp = slingshotPos();
    const dx = pos.x - sp.x;
    const dy = pos.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 80) {
      isDraggingRef.current = true;
      dragRef.current = pos;
    }
  }, [getCanvasPos, slingshotPos]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const gs = stateRef.current;
    if (!gs || gs.phase !== "aiming") return;
    const pos = getCanvasPos(clientX, clientY);
    const sp = slingshotPos();
    const dx = pos.x - sp.x;
    const dy = pos.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_DRAG) {
      const scale = MAX_DRAG / dist;
      dragRef.current = { x: sp.x + dx * scale, y: sp.y + dy * scale };
    } else {
      dragRef.current = pos;
    }
  }, [getCanvasPos, slingshotPos]);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const gs = stateRef.current;
    if (!gs || gs.phase !== "aiming") { dragRef.current = null; return; }
    const drag = dragRef.current;
    if (!drag) return;
    const sp = slingshotPos();
    const dx = drag.x - sp.x;
    const dy = drag.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) { dragRef.current = null; return; }

    const bird = gs.birds[gs.currentBirdIdx];
    if (!bird) { dragRef.current = null; return; }

    const vel = calcLaunchVelocity(drag.x, drag.y, sp.x, sp.y, LAUNCH_POWER);
    bird.vx = vel.x;
    bird.vy = vel.y;
    bird.launched = true;
    gs.phase = "flying";
    setPhase("flying");
    dragRef.current = null;
  }, [slingshotPos]);

  // Mouse events
  const onMouseDown = useCallback((e: React.MouseEvent) => handlePointerDown(e.clientX, e.clientY), [handlePointerDown]);
  const onMouseMove = useCallback((e: React.MouseEvent) => handlePointerMove(e.clientX, e.clientY), [handlePointerMove]);
  const onMouseUp = useCallback(() => handlePointerUp(), [handlePointerUp]);

  // Touch events
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) handlePointerDown(t.clientX, t.clientY);
  }, [handlePointerDown]);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    if (t) handlePointerMove(t.clientX, t.clientY);
  }, [handlePointerMove]);
  const onTouchEnd = useCallback(() => handlePointerUp(), [handlePointerUp]);

  // Special ability on tap during flight
  const handleActivate = useCallback((clientX: number, clientY: number) => {
    const gs = stateRef.current;
    if (!gs || gs.phase !== "flying") return;
    const bird = gs.birds[gs.currentBirdIdx];
    if (!bird || !bird.launched || bird.activated) return;
    bird.activated = true;
    if (bird.type === "yellow") {
      bird.vx *= 2.2;
      bird.vy *= 0.5;
    } else if (bird.type === "black") {
      spawnParticles(bird.x, bird.y, "#ff6600", 20, gs.particles, nextId);
      spawnParticles(bird.x, bird.y, "#ffcc00", 15, gs.particles, nextId);
      const canvas = canvasRef.current;
      if (canvas) {
        const pos = getCanvasPos(clientX, clientY);
        const blastR = 120;
        for (const p of gs.pigs) {
          if (p.dead) continue;
          const dx = p.x - pos.x; const dy = p.y - pos.y;
          if (Math.sqrt(dx*dx+dy*dy) < blastR + p.radius) {
            p.hp -= 4;
            if (p.hp <= 0) { p.dead = true; gs.score += 500; }
          }
        }
        for (const bl of gs.blocks) {
          if (bl.dead) continue;
          const dx = bl.x - pos.x; const dy = bl.y - pos.y;
          if (Math.sqrt(dx*dx+dy*dy) < blastR + Math.max(bl.w,bl.h)/2) {
            bl.hp -= 3;
            if (bl.hp <= 0) bl.dead = true;
          }
        }
      }
      bird.dead = true;
    } else if (bird.type === "blue") {
      // Split into 3
      for (let i = -1; i <= 1; i++) {
        if (i === 0) continue;
        const clone = makeBird("blue", bird.x, bird.y);
        clone.vx = bird.vx + i * 80;
        clone.vy = bird.vy + i * -120;
        clone.launched = true;
        gs.birds.splice(gs.currentBirdIdx + 1, 0, clone);
      }
    }
  }, [getCanvasPos]);

  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    handleActivate(e.clientX, e.clientY);
  }, [handleActivate]);

  const onCanvasTap = useCallback((e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (t) handleActivate(t.clientX, t.clientY);
  }, [handleActivate]);

  // Game loop
  useGameLoop((dt) => {
    const gs = stateRef.current;
    const canvas = canvasRef.current;
    if (!gs || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (gs.phase === "flying" || gs.phase === "settling" || gs.phase === "nextbird") {
      stepPhysics(gs.birds, gs.pigs, gs.blocks, gs.particles, dt, canvas.width, canvas.height);

      // Check if active bird is dead/out → move to next bird or settle
      if (gs.phase === "flying") {
        const bird = gs.birds[gs.currentBirdIdx];
        if (!bird || bird.dead || !bird.launched) {
          gs.phase = "settling";
          gs.settleTimer = 0;
          setPhase("settling");
        }
      }

      // Settling: wait for everything to stop
      if (gs.phase === "settling") {
        gs.settleTimer += dt;
        const allPigsDead = gs.pigs.every(p => p.dead);

        if (allPigsDead || gs.settleTimer >= SETTLE_TIME || isSettled(gs.birds, gs.pigs, gs.blocks)) {
          if (allPigsDead) {
            // Level cleared — load next level immediately, no popup
            const nextLevel = gs.level + 1;
            const currentScore = gs.score;
            updateHighScore(currentScore);
            if (nextLevel >= LEVELS.length) {
              gs.phase = "gameover";
              setPhase("gameover");
              setScore(currentScore);
            } else {
              // Instantly build next level, keep score
              const next = buildLevel(nextLevel, canvas.width, canvas.height, currentScore);
              stateRef.current = next;
              setPhase("aiming");
              setLevel(nextLevel);
              setScore(currentScore);
            }
          } else {
            // Still pigs alive — next bird or game over
            const nextIdx = gs.currentBirdIdx + 1;
            if (nextIdx >= gs.birds.length) {
              gs.phase = "gameover";
              setPhase("gameover");
              updateHighScore(gs.score);
            } else {
              gs.currentBirdIdx = nextIdx;
              gs.phase = "aiming";
              setPhase("aiming");
            }
          }
        }
      }
    }

    // Render
    const sp = slingshotPos();
    renderScene(
      ctx, canvas.width, canvas.height,
      gs.birds, gs.pigs, gs.blocks, gs.particles,
      sp.x, sp.y,
      dragRef.current,
      gs.currentBirdIdx,
      isDraggingRef.current,
      false
    );
  });

  const restart = useCallback(() => {
    initLevel(0, 0);
  }, [initLevel]);

  return (
    <GameShell topbar={
      <GameTopbar
        title="Angry"
        score={score}
        highScore={highScore}
      />
    }>
      <div className="relative w-full h-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onClick={onCanvasClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        />

        {/* Level indicator — brief non-blocking display */}
        {phase === "aiming" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <span className="bg-black/40 text-white text-sm font-semibold px-3 py-1 rounded-full" style={{ fontFamily: "Manrope, sans-serif" }}>
              Level {level + 1}
            </span>
          </div>
        )}

        {/* Game Over overlay */}
        {phase === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
              <p className="text-4xl">🐦</p>
              <h2 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>
                {stateRef.current?.pigs.every(p => p.dead) ? "You Win! 🎉" : "Game Over"}
              </h2>
              <p className="text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Score: {score}</p>
              <p className="text-sm text-gray-500" style={{ fontFamily: "Manrope, sans-serif" }}>Best: {highScore}</p>
              <button
                onClick={restart}
                className="mt-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-lg"
                style={{ fontFamily: "Manrope, sans-serif", minHeight: 44 }}
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}
