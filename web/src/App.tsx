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

// Slingshot position as fraction of canvas
const SLINGSHOT_X_FRAC = 0.14;
const SLINGSHOT_Y_FRAC = 0.68;

// Launch power multiplier — higher = faster/further
const LAUNCH_POWER = 7.5;

// How many pixels you can drag from slingshot center
// Using a large value so aiming covers the full screen
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

  const birds: Bird[] = lvl.birds.map((type, i) => {
    if (i === 0) return makeBird(type, sx, sy);
    return makeBird(type, sx - 40 - i * 30, sy + 20);
  });

  const pigs: Pig[] = lvl.pigs.map(p => makePig(p.x * canvasW, p.y, p.hp, groundY));

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
  const stateRef = useRef<GameState | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, updateHighScore] = useHighScore("angrry_highscore");
  const [phase, setPhase] = useState<GamePhase>("aiming");
  const [level, setLevel] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragPosRef = useRef<Vec2 | null>(null);
  const isDraggingRef = useRef(false);
  const darkMode = false;

  // Canvas size
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    // Rebuild level on resize
    if (stateRef.current) {
      const lvlIdx = stateRef.current.level;
      const sc = stateRef.current.score;
      stateRef.current = buildLevel(lvlIdx, canvas.width, canvas.height);
      stateRef.current.score = sc;
      setPhase("aiming");
    }
  }, []);

  // Init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    stateRef.current = buildLevel(0, canvas.width, canvas.height);
    setPhase("aiming");

    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  // Get canvas-relative position
  const getCanvasPos = useCallback((clientX: number, clientY: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  // Check if point is near slingshot (for drag start)
  const nearSlingshot = useCallback((pos: Vec2): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const sx = canvas.width * SLINGSHOT_X_FRAC;
    const sy = canvas.height * SLINGSHOT_Y_FRAC;
    const dx = pos.x - sx;
    const dy = pos.y - sy;
    return Math.sqrt(dx * dx + dy * dy) < 55;
  }, []);

  // Clamp drag to MAX_DRAG radius
  const clampDrag = useCallback((pos: Vec2): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return pos;
    const sx = canvas.width * SLINGSHOT_X_FRAC;
    const sy = canvas.height * SLINGSHOT_Y_FRAC;
    const dx = pos.x - sx;
    const dy = pos.y - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= MAX_DRAG) return pos;
    return {
      x: sx + (dx / dist) * MAX_DRAG,
      y: sy + (dy / dist) * MAX_DRAG,
    };
  }, []);

  const handlePointerDown = useCallback((clientX: number, clientY: number) => {
    const st = stateRef.current;
    if (!st || st.phase !== "aiming") return;
    const pos = getCanvasPos(clientX, clientY);
    if (!nearSlingshot(pos)) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragPosRef.current = clampDrag(pos);
  }, [getCanvasPos, nearSlingshot, clampDrag]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const pos = getCanvasPos(clientX, clientY);
    dragPosRef.current = clampDrag(pos);
  }, [getCanvasPos, clampDrag]);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const st = stateRef.current;
    const drag = dragPosRef.current;
    const canvas = canvasRef.current;
    if (!st || !drag || !canvas) return;
    if (st.phase !== "aiming") return;

    const sx = canvas.width * SLINGSHOT_X_FRAC;
    const sy = canvas.height * SLINGSHOT_Y_FRAC;

    // Require a meaningful drag
    const dx = drag.x - sx;
    const dy = drag.y - sy;
    const dragDist = Math.sqrt(dx * dx + dy * dy);
    if (dragDist < 10) return;

    const vel = calcLaunchVelocity(drag.x, drag.y, sx, sy, LAUNCH_POWER);

    const bird = st.birds[st.currentBirdIdx];
    if (!bird) return;
    bird.vx = vel.x;
    bird.vy = vel.y;
    bird.launched = true;
    bird.x = drag.x;
    bird.y = drag.y;

    st.phase = "flying";
    setPhase("flying");
    dragPosRef.current = null;
  }, []);

  // Special ability on tap during flight
  const handleTapDuringFlight = useCallback((clientX: number, clientY: number) => {
    const st = stateRef.current;
    if (!st || st.phase !== "flying") return;
    const bird = st.birds[st.currentBirdIdx];
    if (!bird || !bird.launched || bird.dead || bird.activated) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    bird.activated = true;

    if (bird.type === "yellow") {
      // Speed boost forward
      const speed = Math.sqrt(bird.vx * bird.vx + bird.vy * bird.vy);
      const nx = bird.vx / speed;
      const ny = bird.vy / speed;
      bird.vx = nx * Math.max(speed * 2.2, 900);
      bird.vy = ny * Math.max(speed * 2.2, 900);
    } else if (bird.type === "black") {
      // Explosion
      const pos = getCanvasPos(clientX, clientY);
      spawnParticles(bird.x, bird.y, "#ff6600", 20, st.particles, nextId);
      spawnParticles(bird.x, bird.y, "#ffcc00", 15, st.particles, nextId);
      // Damage everything nearby
      const blastR = 120;
      for (const p of st.pigs) {
        if (p.dead) continue;
        const d = Math.sqrt((p.x - bird.x) ** 2 + (p.y - bird.y) ** 2);
        if (d < blastR + p.radius) {
          p.hp -= 3;
          const force = (1 - d / blastR) * 600;
          const ang = Math.atan2(p.y - bird.y, p.x - bird.x);
          p.vx += Math.cos(ang) * force;
          p.vy += Math.sin(ang) * force - 200;
          if (p.hp <= 0) {
            p.dead = true;
            spawnParticles(p.x, p.y, "#44cc44", 12, st.particles, nextId);
          }
        }
      }
      for (const bl of st.blocks) {
        if (bl.dead) continue;
        const d = Math.sqrt((bl.x - bird.x) ** 2 + (bl.y - bird.y) ** 2);
        if (d < blastR + Math.max(bl.w, bl.h) * 0.5) {
          bl.hp -= 4;
          const force = (1 - d / blastR) * 500;
          const ang = Math.atan2(bl.y - bird.y, bl.x - bird.x);
          bl.vx += Math.cos(ang) * force;
          bl.vy += Math.sin(ang) * force - 150;
          bl.angularVel += (Math.random() - 0.5) * 8;
          if (bl.hp <= 0) {
            bl.dead = true;
          }
        }
      }
      bird.dead = true;
      void pos;
    } else if (bird.type === "blue") {
      // Split into 3
      const spread = 0.3;
      for (let i = -1; i <= 1; i++) {
        if (i === 0) continue;
        const clone = makeBird("blue", bird.x, bird.y);
        clone.launched = true;
        clone.activated = true;
        const angle = Math.atan2(bird.vy, bird.vx) + i * spread;
        const speed = Math.sqrt(bird.vx * bird.vx + bird.vy * bird.vy);
        clone.vx = Math.cos(angle) * speed;
        clone.vy = Math.sin(angle) * speed;
        st.birds.splice(st.currentBirdIdx + 1, 0, clone);
      }
    }
  }, [getCanvasPos]);

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: MouseEvent) => {
      if (stateRef.current?.phase === "flying") {
        handleTapDuringFlight(e.clientX, e.clientY);
      } else {
        handlePointerDown(e.clientX, e.clientY);
      }
    };
    const onMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
    const onUp = () => handlePointerUp();

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp, handleTapDuringFlight]);

  // Touch events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      if (stateRef.current?.phase === "flying") {
        handleTapDuringFlight(t.clientX, t.clientY);
      } else {
        handlePointerDown(t.clientX, t.clientY);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      handlePointerMove(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      handlePointerUp();
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp, handleTapDuringFlight]);

  // Game loop
  useGameLoop((dt: number) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!st || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    if (st.phase === "flying" || st.phase === "settling") {
      stepPhysics(st.birds, st.pigs, st.blocks, st.particles, dt, w, h, nextId);

      // Score dead pigs
      for (const p of st.pigs) {
        if (p.dead && p.hp <= 0) {
          // Only score once — mark hp as already counted
          if (p.hp === 0) {
            st.score += 500;
            p.hp = -1;
          }
        }
      }
      // Score dead blocks
      for (const bl of st.blocks) {
        if (bl.dead && bl.hp <= 0) {
          if (bl.hp === 0) {
            st.score += 100;
            bl.hp = -1;
          }
        }
      }

      const activeBird = st.birds[st.currentBirdIdx];

      if (st.phase === "flying") {
        // Check if current bird died
        if (!activeBird || activeBird.dead) {
          st.phase = "settling";
          st.settleTimer = 0;
        }
      }

      if (st.phase === "settling") {
        st.settleTimer += dt;
        const settled = isSettled(st.birds, st.pigs, st.blocks) || st.settleTimer > SETTLE_TIME;

        if (settled) {
          const allPigsDead = st.pigs.every(p => p.dead);
          if (allPigsDead) {
            // Bonus for remaining birds
            const remainingBirds = st.birds.length - st.currentBirdIdx - 1;
            st.score += remainingBirds * 1000;
            setScore(st.score);
            updateHighScore(st.score);
            st.phase = "levelclear";
            setPhase("levelclear");
          } else {
            // Advance to next bird
            const nextIdx = st.currentBirdIdx + 1;
            if (nextIdx >= st.birds.length) {
              setScore(st.score);
              updateHighScore(st.score);
              st.phase = "gameover";
              setPhase("gameover");
            } else {
              st.currentBirdIdx = nextIdx;
              const sx = w * SLINGSHOT_X_FRAC;
              const sy = h * SLINGSHOT_Y_FRAC;
              const nextBird = st.birds[nextIdx];
              if (nextBird) {
                nextBird.x = sx;
                nextBird.y = sy;
              }
              st.phase = "aiming";
              setPhase("aiming");
            }
          }
          setScore(st.score);
        }
      }
    }

    // Render
    const sx = w * SLINGSHOT_X_FRAC;
    const sy = h * SLINGSHOT_Y_FRAC;
    renderScene(
      ctx, w, h,
      st.birds, st.pigs, st.blocks, st.particles,
      sx, sy,
      isDraggingRef.current ? dragPosRef.current : null,
      st.currentBirdIdx,
      isDraggingRef.current,
      darkMode
    );

    // Overlay text
    if (st.phase === "levelclear") {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(h * 0.08)}px Fraunces, serif`;
      ctx.textAlign = "center";
      ctx.fillText("Level Clear! 🎉", w / 2, h * 0.42);
      ctx.font = `${Math.round(h * 0.045)}px Manrope, sans-serif`;
      ctx.fillText(`Score: ${st.score}`, w / 2, h * 0.52);
      ctx.fillStyle = "#ffe066";
      ctx.font = `bold ${Math.round(h * 0.05)}px Manrope, sans-serif`;
      ctx.fillText("Tap to continue", w / 2, h * 0.63);
      ctx.restore();
    } else if (st.phase === "gameover") {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ff4444";
      ctx.font = `bold ${Math.round(h * 0.08)}px Fraunces, serif`;
      ctx.textAlign = "center";
      ctx.fillText("Game Over", w / 2, h * 0.42);
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.round(h * 0.045)}px Manrope, sans-serif`;
      ctx.fillText(`Score: ${st.score}`, w / 2, h * 0.52);
      ctx.fillStyle = "#ffe066";
      ctx.font = `bold ${Math.round(h * 0.05)}px Manrope, sans-serif`;
      ctx.fillText("Tap to retry", w / 2, h * 0.63);
      ctx.restore();
    } else if (st.phase === "aiming") {
      // Hint text
      const bird = st.birds[st.currentBirdIdx];
      if (bird) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.font = `${Math.round(h * 0.032)}px Manrope, sans-serif`;
        ctx.textAlign = "center";
        const hint = bird.type === "yellow" ? "Tap mid-air to boost!" :
                     bird.type === "black"  ? "Tap mid-air to explode!" :
                     bird.type === "blue"   ? "Tap mid-air to split!" :
                     "Drag & release to launch";
        ctx.fillText(hint, w / 2, h * 0.94);
        ctx.restore();
      }
    }
  });

  // Tap to advance on levelclear / gameover
  const handleCanvasTap = useCallback((clientX: number, clientY: number) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!st || !canvas) return;
    void clientX; void clientY;

    if (st.phase === "levelclear") {
      const nextLevel = (st.level + 1) % LEVELS.length;
      stateRef.current = buildLevel(nextLevel, canvas.width, canvas.height);
      stateRef.current.score = st.score;
      setLevel(nextLevel);
      setPhase("aiming");
    } else if (st.phase === "gameover") {
      stateRef.current = buildLevel(st.level, canvas.width, canvas.height);
      setPhase("aiming");
      setScore(0);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = (e: MouseEvent) => handleCanvasTap(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) handleCanvasTap(t.clientX, t.clientY);
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchstart", onTouch);
    };
  }, [handleCanvasTap]);

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Angry 🐦"
          score={score}
          highScore={highScore}
          extraInfo={`Level ${level + 1}`}
        />
      }
    >
      <div className="relative w-full h-full overflow-hidden bg-sky-300">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        />
      </div>
    </GameShell>
  );
}
