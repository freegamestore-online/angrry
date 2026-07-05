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

const SLINGSHOT_X_FRAC = 0.18;
const SLINGSHOT_Y_FRAC = 0.68;
const LAUNCH_POWER = 6;
const MAX_DRAG = 140;
const SETTLE_TIME = 2.5;

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

  const birds = lvl.birds.map((t) => makeBird(t, sx, sy));

  const pigs = lvl.pigs.map((p) =>
    makePig(canvasW * p.x, 0, p.hp, groundY)
  );

  // Stack blocks vertically based on their y=0 placeholder
  // We need to stack them — group by x position
  const blocksByX: Map<number, typeof lvl.blocks[0][]> = new Map();
  for (const b of lvl.blocks) {
    const key = Math.round(b.x * 1000);
    const arr = blocksByX.get(key) ?? [];
    arr.push(b);
    blocksByX.set(key, arr);
  }

  const blocks: Block[] = [];
  for (const [, group] of blocksByX) {
    let stackY = groundY;
    // Sort by original order (bottom to top)
    for (const b of [...group].reverse()) {
      const by = stackY - b.h / 2;
      stackY -= b.h;
      blocks.push(makeBlock(
        canvasW * b.x, by, b.w, b.h,
        b.type, b.angle ?? 0, groundY
      ));
    }
  }

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
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 480 });
  const [highScore, updateHighScore] = useHighScore("angrrybirds_hs");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [phase, setPhase] = useState<GamePhase>("aiming");

  const gameRef = useRef<GameState | null>(null);
  const isDraggingRef = useRef(false);
  const dragPosRef = useRef<Vec2 | null>(null);
  const dragStartRef = useRef<Vec2 | null>(null);

  // Resize canvas to fill container
  useEffect(() => {
    function resize() {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      setCanvasSize({ w, h });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Init game when canvas size is known
  useEffect(() => {
    if (canvasSize.w < 100) return;
    gameRef.current = buildLevel(0, canvasSize.w, canvasSize.h);
    setDisplayScore(0);
    setDisplayLevel(1);
    setPhase("aiming");
  }, [canvasSize.w, canvasSize.h]);

  const slingshotX = canvasSize.w * SLINGSHOT_X_FRAC;
  const slingshotY = canvasSize.h * SLINGSHOT_Y_FRAC;
  // Max slingshot pull scales with the canvas so you can aim across the whole
  // screen (a fixed 80px cap barely reached past the slingshot on wide canvases).
  const maxDrag = Math.max(MAX_DRAG, canvasSize.w * 0.3);

  // --- Input helpers ---
  const getCanvasPos = useCallback((clientX: number, clientY: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const startDrag = useCallback((pos: Vec2) => {
    const g = gameRef.current;
    if (!g || g.phase !== "aiming") return;
    const bird = g.birds[g.currentBirdIdx];
    if (!bird || bird.launched) return;
    const dx = pos.x - slingshotX;
    const dy = pos.y - slingshotY;
    if (Math.sqrt(dx * dx + dy * dy) < 60) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: slingshotX, y: slingshotY };
      dragPosRef.current = { x: slingshotX, y: slingshotY };
    }
  }, [slingshotX, slingshotY]);

  const moveDrag = useCallback((pos: Vec2) => {
    if (!isDraggingRef.current) return;
    const dx = pos.x - slingshotX;
    const dy = pos.y - slingshotY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDrag) {
      const scale = maxDrag / dist;
      dragPosRef.current = { x: slingshotX + dx * scale, y: slingshotY + dy * scale };
    } else {
      dragPosRef.current = { x: pos.x, y: pos.y };
    }
  }, [slingshotX, slingshotY, maxDrag]);

  const endDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const g = gameRef.current;
    if (!g || g.phase !== "aiming") return;
    const bird = g.birds[g.currentBirdIdx];
    const dp = dragPosRef.current;
    if (!bird || !dp) return;

    // Minimum drag to launch
    const ddx = dp.x - slingshotX;
    const ddy = dp.y - slingshotY;
    if (Math.sqrt(ddx * ddx + ddy * ddy) < 10) {
      dragPosRef.current = null;
      return;
    }

    const vel = calcLaunchVelocity(slingshotX, slingshotY, dp.x, dp.y, LAUNCH_POWER);
    bird.x = dp.x;
    bird.y = dp.y;
    bird.vx = vel.x;
    bird.vy = vel.y;
    bird.launched = true;
    g.phase = "flying";
    dragPosRef.current = null;
    setPhase("flying");
  }, [slingshotX, slingshotY]);

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: MouseEvent) => { startDrag(getCanvasPos(e.clientX, e.clientY)); };
    const onMove = (e: MouseEvent) => { moveDrag(getCanvasPos(e.clientX, e.clientY)); };
    const onUp = () => { endDrag(); };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [startDrag, moveDrag, endDrag, getCanvasPos]);

  // Touch events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) startDrag(getCanvasPos(t.clientX, t.clientY));
    };
    const onTMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) moveDrag(getCanvasPos(t.clientX, t.clientY));
    };
    const onTEnd = (e: TouchEvent) => {
      e.preventDefault();
      endDrag();
    };

    canvas.addEventListener("touchstart", onTStart, { passive: false });
    canvas.addEventListener("touchmove", onTMove, { passive: false });
    canvas.addEventListener("touchend", onTEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTStart);
      canvas.removeEventListener("touchmove", onTMove);
      canvas.removeEventListener("touchend", onTEnd);
    };
  }, [startDrag, moveDrag, endDrag, getCanvasPos]);

  // Special ability on tap during flight
  const activateBird = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.phase !== "flying") return;
    const bird = g.birds[g.currentBirdIdx];
    if (!bird || !bird.launched || bird.dead || bird.activated) return;
    bird.activated = true;

    if (bird.type === "yellow") {
      // Speed boost
      bird.vx *= 2.2;
      bird.vy *= 0.5;
      spawnParticles(g.particles, bird.x, bird.y, "#f1c40f", 8);
    } else if (bird.type === "black") {
      // Explosion
      const expR = 120;
      for (const p of g.pigs) {
        if (p.dead) continue;
        const dx = p.x - bird.x;
        const dy = p.y - bird.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < expR) {
          p.hp -= (1 - d / expR) * 6;
          if (p.hp <= 0) p.dead = true;
          p.vx += (dx / d) * 400;
          p.vy += (dy / d) * 400 - 200;
        }
      }
      for (const bl of g.blocks) {
        if (bl.dead) continue;
        const dx = bl.x - bird.x;
        const dy = bl.y - bird.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < expR) {
          bl.hp -= (1 - d / expR) * 5;
          if (bl.hp <= 0) bl.dead = true;
          bl.vx += (dx / d) * 300;
          bl.vy += (dy / d) * 300 - 150;
        }
      }
      spawnParticles(g.particles, bird.x, bird.y, "#e17055", 25);
      spawnParticles(g.particles, bird.x, bird.y, "#f39c12", 20);
      bird.dead = true;
    } else if (bird.type === "blue") {
      // Split into 3
      const angles = [-0.3, 0, 0.3];
      for (let i = 1; i < 3; i++) {
        const a = angles[i] ?? 0;
        const speed = Math.sqrt(bird.vx * bird.vx + bird.vy * bird.vy);
        const baseAngle = Math.atan2(bird.vy, bird.vx);
        const nb: Bird = {
          id: nextId(), type: "blue",
          x: bird.x, y: bird.y,
          vx: Math.cos(baseAngle + a) * speed,
          vy: Math.sin(baseAngle + a) * speed,
          radius: bird.radius, launched: true, dead: false,
          trail: [], activated: true,
        };
        g.birds.splice(g.currentBirdIdx + i, 0, nb);
      }
    }
  }, []);

  // Tap canvas during flight = activate
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onTap = () => activateBird();
    canvas.addEventListener("click", onTap);
    return () => canvas.removeEventListener("click", onTap);
  }, [activateBird]);

  // Game loop
  useGameLoop(useCallback((dt: number) => {
    const g = gameRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = canvasSize;

    // Physics
    if (g.phase === "flying" || g.phase === "settling") {
      stepPhysics(g.birds, g.pigs, g.blocks, g.particles, dt, w, h);

      // Clean dead particles
      g.particles = g.particles.filter(p => p.life > 0);

      // Score from killed pigs
      let newScore = g.score;
      for (const p of g.pigs) {
        if (p.dead && p.hp <= 0) {
          newScore += 1000;
          p.hp = -999; // prevent double-score
        }
      }
      for (const bl of g.blocks) {
        if (bl.dead && bl.hp <= 0) {
          newScore += 100;
          bl.hp = -999;
        }
      }
      if (newScore !== g.score) {
        g.score = newScore;
        setDisplayScore(newScore);
        updateHighScore(newScore);
      }

      // Check if current bird is done
      const bird = g.birds[g.currentBirdIdx];
      if (bird && bird.launched && bird.dead) {
        g.phase = "settling";
      }

      // Settling phase
      if (g.phase === "settling") {
        g.settleTimer += dt;
        if (g.settleTimer > SETTLE_TIME || isSettled(g.birds, g.pigs, g.blocks)) {
          g.settleTimer = 0;
          const allPigsDead = g.pigs.every(p => p.dead);
          if (allPigsDead) {
            g.phase = "levelclear";
            setPhase("levelclear");
          } else {
            // Next bird
            g.currentBirdIdx++;
            const nextBird = g.birds[g.currentBirdIdx];
            if (!nextBird) {
              g.phase = "gameover";
              setPhase("gameover");
            } else {
              nextBird.x = slingshotX;
              nextBird.y = slingshotY;
              g.phase = "aiming";
              setPhase("aiming");
            }
          }
        }
      }
    }

    // Render
    const isDark = document.documentElement.classList.contains("dark");
    renderScene(
      ctx, w, h,
      g.birds, g.pigs, g.blocks, g.particles,
      slingshotX, slingshotY,
      dragPosRef.current,
      g.currentBirdIdx,
      isDraggingRef.current,
      isDark
    );
  }, [canvasSize, slingshotX, slingshotY, updateHighScore]));

  const handleNextLevel = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const nextLevel = (g.level + 1) % LEVELS.length;
    const bonus = g.birds.slice(g.currentBirdIdx + 1).filter(b => !b.launched).length * 3000;
    const totalScore = g.score + bonus;
    updateHighScore(totalScore);
    const newState = buildLevel(nextLevel, canvasSize.w, canvasSize.h);
    newState.score = totalScore;
    gameRef.current = newState;
    setDisplayScore(totalScore);
    setDisplayLevel(nextLevel + 1);
    setPhase("aiming");
  }, [canvasSize, updateHighScore]);

  const handleRestart = useCallback(() => {
    const g = gameRef.current;
    const level = g?.level ?? 0;
    const newState = buildLevel(level, canvasSize.w, canvasSize.h);
    gameRef.current = newState;
    setDisplayScore(0);
    setDisplayLevel(level + 1);
    setPhase("aiming");
    isDraggingRef.current = false;
    dragPosRef.current = null;
  }, [canvasSize]);

  const handleRestartFromLevel1 = useCallback(() => {
    const newState = buildLevel(0, canvasSize.w, canvasSize.h);
    gameRef.current = newState;
    setDisplayScore(0);
    setDisplayLevel(1);
    setPhase("aiming");
    isDraggingRef.current = false;
    dragPosRef.current = null;
  }, [canvasSize]);

  return (
    <GameShell topbar={<GameTopbar title="Angry Birds" score={displayScore} highScore={highScore} />}>
      <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none">
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="w-full h-full block touch-none"
          style={{ cursor: isDraggingRef.current ? "grabbing" : "grab" }}
        />

        {/* HUD */}
        <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
          <div
            className="px-3 py-1 rounded-full text-sm font-bold"
            style={{
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              fontFamily: "Fraunces, serif",
            }}
          >
            Level {displayLevel}
          </div>
        </div>

        {/* Instructions */}
        {phase === "aiming" && (
          <div
            className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm text-white pointer-events-none"
            style={{ background: "rgba(0,0,0,0.45)", fontFamily: "Manrope, sans-serif" }}
          >
            🐦 Drag the bird to aim • Tap in flight for special!
          </div>
        )}
        {phase === "flying" && (
          <div
            className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm text-white pointer-events-none"
            style={{ background: "rgba(0,0,0,0.45)", fontFamily: "Manrope, sans-serif" }}
          >
            ✨ Tap to activate special power!
          </div>
        )}

        {/* Level Clear overlay */}
        {phase === "levelclear" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(0,0,0,0.55)" }}>
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl"
              style={{ background: "var(--surface)", border: "2px solid var(--border)", maxWidth: 340 }}>
              <div className="text-5xl">🎉</div>
              <h2 className="text-3xl font-bold" style={{ fontFamily: "Fraunces, serif", color: "var(--ink)" }}>
                Level Clear!
              </h2>
              <p style={{ color: "var(--muted)", fontFamily: "Manrope, sans-serif" }}>
                Score: <strong style={{ color: "var(--accent)" }}>{displayScore.toLocaleString()}</strong>
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleNextLevel}
                  className="px-6 py-3 rounded-xl font-bold text-white text-lg"
                  style={{ background: "var(--accent)", fontFamily: "Manrope, sans-serif", minWidth: 44, minHeight: 44 }}
                >
                  Next Level →
                </button>
                <button
                  onClick={handleRestart}
                  className="px-4 py-3 rounded-xl font-bold text-sm"
                  style={{
                    background: "var(--surface)",
                    border: "2px solid var(--border)",
                    color: "var(--ink)",
                    fontFamily: "Manrope, sans-serif",
                    minWidth: 44, minHeight: 44,
                  }}
                >
                  Replay
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Game Over overlay */}
        {phase === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}>
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl"
              style={{ background: "var(--surface)", border: "2px solid var(--border)", maxWidth: 340 }}>
              <div className="text-5xl">😤</div>
              <h2 className="text-3xl font-bold" style={{ fontFamily: "Fraunces, serif", color: "var(--ink)" }}>
                No Birds Left!
              </h2>
              <p style={{ color: "var(--muted)", fontFamily: "Manrope, sans-serif" }}>
                Score: <strong style={{ color: "var(--accent)" }}>{displayScore.toLocaleString()}</strong>
              </p>
              <p style={{ color: "var(--muted)", fontFamily: "Manrope, sans-serif", fontSize: "0.85rem" }}>
                Best: {highScore.toLocaleString()}
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleRestart}
                  className="px-6 py-3 rounded-xl font-bold text-white text-lg"
                  style={{ background: "#e17055", fontFamily: "Manrope, sans-serif", minWidth: 44, minHeight: 44 }}
                >
                  Try Again
                </button>
                <button
                  onClick={handleRestartFromLevel1}
                  className="px-4 py-3 rounded-xl font-bold text-sm"
                  style={{
                    background: "var(--surface)",
                    border: "2px solid var(--border)",
                    color: "var(--ink)",
                    fontFamily: "Manrope, sans-serif",
                    minWidth: 44, minHeight: 44,
                  }}
                >
                  Level 1
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}
