export interface Vec2 {
  x: number;
  y: number;
}

export type BirdType = "red" | "blue" | "yellow" | "black";

export interface Bird {
  id: number;
  type: BirdType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  launched: boolean;
  dead: boolean;
  trail: Vec2[];
  activated: boolean; // special ability used
}

export interface Pig {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  angle: number;
}

export type BlockType = "wood" | "stone" | "ice";

export interface Block {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  angularVel: number;
  hp: number;
  maxHp: number;
  type: BlockType;
  dead: boolean;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
}

export interface Level {
  birds: BirdType[];
  pigs: Array<{ x: number; y: number; hp: number }>;
  blocks: Array<{ x: number; y: number; w: number; h: number; type: BlockType; angle?: number }>;
}

export type GamePhase = "aiming" | "flying" | "settling" | "gameover" | "nextbird";
