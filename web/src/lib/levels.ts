import type { Level } from "../types";

export const LEVELS: Level[] = [
  // Level 1 — Tutorial: simple tower
  {
    birds: ["red", "red", "red"],
    pigs: [
      { x: 0.72, y: 0, hp: 3 },
    ],
    blocks: [
      { x: 0.695, y: 0, w: 18, h: 80, type: "wood" },
      { x: 0.745, y: 0, w: 18, h: 80, type: "wood" },
      { x: 0.72, y: 0, w: 60, h: 18, type: "wood" },
    ],
  },
  // Level 2 — Two pigs, wood fortress
  {
    birds: ["red", "blue", "red"],
    pigs: [
      { x: 0.65, y: 0, hp: 3 },
      { x: 0.78, y: 0, hp: 3 },
    ],
    blocks: [
      { x: 0.62, y: 0, w: 16, h: 90, type: "wood" },
      { x: 0.68, y: 0, w: 16, h: 90, type: "wood" },
      { x: 0.65, y: 0, w: 70, h: 16, type: "wood" },
      { x: 0.75, y: 0, w: 16, h: 90, type: "wood" },
      { x: 0.81, y: 0, w: 16, h: 90, type: "wood" },
      { x: 0.78, y: 0, w: 70, h: 16, type: "wood" },
    ],
  },
  // Level 3 — Stone fortress
  {
    birds: ["red", "yellow", "black", "red"],
    pigs: [
      { x: 0.68, y: 0, hp: 4 },
      { x: 0.80, y: 0, hp: 4 },
    ],
    blocks: [
      { x: 0.64, y: 0, w: 18, h: 100, type: "stone" },
      { x: 0.72, y: 0, w: 18, h: 100, type: "stone" },
      { x: 0.68, y: 0, w: 80, h: 18, type: "stone" },
      { x: 0.76, y: 0, w: 18, h: 100, type: "stone" },
      { x: 0.84, y: 0, w: 18, h: 100, type: "stone" },
      { x: 0.80, y: 0, w: 80, h: 18, type: "stone" },
      { x: 0.68, y: 0, w: 50, h: 18, type: "wood", angle: 0 },
      { x: 0.80, y: 0, w: 50, h: 18, type: "wood", angle: 0 },
    ],
  },
  // Level 4 — Ice fortress + mixed pigs
  {
    birds: ["blue", "blue", "yellow", "black"],
    pigs: [
      { x: 0.63, y: 0, hp: 2 },
      { x: 0.73, y: 0, hp: 3 },
      { x: 0.83, y: 0, hp: 2 },
    ],
    blocks: [
      { x: 0.60, y: 0, w: 16, h: 85, type: "ice" },
      { x: 0.66, y: 0, w: 16, h: 85, type: "ice" },
      { x: 0.63, y: 0, w: 65, h: 16, type: "ice" },
      { x: 0.70, y: 0, w: 16, h: 85, type: "wood" },
      { x: 0.76, y: 0, w: 16, h: 85, type: "wood" },
      { x: 0.73, y: 0, w: 65, h: 16, type: "wood" },
      { x: 0.80, y: 0, w: 16, h: 85, type: "stone" },
      { x: 0.86, y: 0, w: 16, h: 85, type: "stone" },
      { x: 0.83, y: 0, w: 65, h: 16, type: "stone" },
    ],
  },
  // Level 5 — Boss level
  {
    birds: ["red", "yellow", "black", "blue", "black"],
    pigs: [
      { x: 0.60, y: 0, hp: 5 },
      { x: 0.70, y: 0, hp: 5 },
      { x: 0.80, y: 0, hp: 5 },
      { x: 0.70, y: 0, hp: 6 },
    ],
    blocks: [
      // Left tower
      { x: 0.57, y: 0, w: 16, h: 110, type: "stone" },
      { x: 0.63, y: 0, w: 16, h: 110, type: "stone" },
      { x: 0.60, y: 0, w: 65, h: 16, type: "stone" },
      { x: 0.60, y: 0, w: 40, h: 16, type: "wood" },
      // Middle tower
      { x: 0.67, y: 0, w: 16, h: 120, type: "stone" },
      { x: 0.73, y: 0, w: 16, h: 120, type: "stone" },
      { x: 0.70, y: 0, w: 65, h: 16, type: "stone" },
      { x: 0.70, y: 0, w: 65, h: 16, type: "wood" },
      // Right tower
      { x: 0.77, y: 0, w: 16, h: 110, type: "stone" },
      { x: 0.83, y: 0, w: 16, h: 110, type: "stone" },
      { x: 0.80, y: 0, w: 65, h: 16, type: "stone" },
      { x: 0.80, y: 0, w: 40, h: 16, type: "ice" },
    ],
  },
];
