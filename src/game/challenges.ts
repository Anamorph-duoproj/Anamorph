import { EXAMPLES } from "./examples";
import type { Sketch } from "./types";

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: "Starter" | "Easy" | "Medium" | "Hard";
  target: {
    moves: number;
    rotations: number;
  };
  sketch: Sketch;
}

export const CHALLENGES: Challenge[] = [
  {
    id: "bridge",
    title: "Bridge",
    description: "Find the straight route and learn the snap views.",
    difficulty: "Starter",
    target: { moves: 3, rotations: 3 },
    sketch: EXAMPLES[0].sketch,
  },
  {
    id: "zigzag",
    title: "Zigzag",
    description: "Keep the path moving across alternating views.",
    difficulty: "Easy",
    target: { moves: 5, rotations: 5 },
    sketch: EXAMPLES[1].sketch,
  },
  {
    id: "triangle-tower",
    title: "Triangle Tower",
    description: "Pick the shortest branch through the upper platforms.",
    difficulty: "Medium",
    target: { moves: 4, rotations: 5 },
    sketch: EXAMPLES[2].sketch,
  },
  {
    id: "star",
    title: "Star",
    description: "Use the center platform to open the right spoke.",
    difficulty: "Medium",
    target: { moves: 2, rotations: 4 },
    sketch: EXAMPLES[3].sketch,
  },
  {
    id: "loop",
    title: "Loop",
    description: "Choose the better direction around the ring.",
    difficulty: "Hard",
    target: { moves: 4, rotations: 6 },
    sketch: EXAMPLES[4].sketch,
  },
];
