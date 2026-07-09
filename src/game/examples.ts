import type { ExampleSketch, Sketch } from "./types.ts";

function sketch(
  coords: [number, number][],
  edges: [number, number][],
  start: number,
  goal: number
): Sketch {
  return {
    nodes: coords.map(([x, y], id) => ({ id, x, y })),
    edges,
    start,
    goal,
  };
}

export const EXAMPLES: ExampleSketch[] = [
  {
    name: "Bridge",
    description: "Four platforms in a row. A gentle first puzzle.",
    sketch: sketch(
      [
        [0.15, 0.55],
        [0.38, 0.45],
        [0.62, 0.55],
        [0.85, 0.45],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      0,
      3
    ),
  },
  {
    name: "Zigzag",
    description: "Six platforms in a zigzag. Several rotations are needed.",
    sketch: sketch(
      [
        [0.12, 0.75],
        [0.3, 0.35],
        [0.48, 0.7],
        [0.62, 0.3],
        [0.78, 0.65],
        [0.9, 0.25],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
      ],
      0,
      5
    ),
  },
  {
    name: "Triangle Tower",
    description: "A triangle with branches. There is more than one route.",
    sketch: sketch(
      [
        [0.15, 0.8],
        [0.4, 0.6],
        [0.6, 0.75],
        [0.5, 0.35],
        [0.82, 0.25],
      ],
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 3],
        [3, 4],
      ],
      0,
      4
    ),
  },
  {
    name: "Star",
    description: "Everything passes through the center. Which view opens the path?",
    sketch: sketch(
      [
        [0.5, 0.5],
        [0.5, 0.15],
        [0.85, 0.4],
        [0.72, 0.82],
        [0.28, 0.82],
        [0.15, 0.4],
      ],
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
      ],
      5,
      2
    ),
  },
  {
    name: "Loop",
    description: "Eight platforms in a ring. Choose the right way around.",
    sketch: sketch(
      [
        [0.5, 0.12],
        [0.78, 0.24],
        [0.88, 0.5],
        [0.78, 0.76],
        [0.5, 0.88],
        [0.22, 0.76],
        [0.12, 0.5],
        [0.22, 0.24],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 0],
      ],
      0,
      4
    ),
  },
];
