import { adjacency, bfsPath } from "./pathfinding.ts";
import type { Sketch, SketchEdge } from "./types.ts";

export type ChallengeDifficulty = "easy" | "medium" | "hard" | "impossible";

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  target: {
    moves: number;
    rotations: number;
  };
  sketch: Sketch;
}

export const CHALLENGE_GROUPS: Array<{
  id: ChallengeDifficulty;
  label: string;
  description: string;
  color: string;
  softColor: string;
}> = [
  {
    id: "easy",
    label: "Easy",
    description: "Short routes for learning how views connect.",
    color: "#23785e",
    softColor: "#dff6ed",
  },
  {
    id: "medium",
    label: "Medium",
    description: "Longer paths with useful branches and choices.",
    color: "#356f8b",
    softColor: "#dfedf5",
  },
  {
    id: "hard",
    label: "Hard",
    description: "Dense networks that need deliberate rotations.",
    color: "#8a6230",
    softColor: "#f8edcf",
  },
  {
    id: "impossible",
    label: "Impossible",
    description: "The largest sketches with up to 20 platforms and deceptive routes.",
    color: "#994a5c",
    softColor: "#fae3e8",
  },
];

type Point = readonly [number, number];

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function route(points: readonly Point[], extraEdges: SketchEdge[] = []): Sketch {
  const pathEdges: SketchEdge[] = points.slice(1).map((_, index) => [index, index + 1]);
  return {
    nodes: points.map(([x, y], id) => ({ id, x, y })),
    edges: [...pathEdges, ...extraEdges],
    start: 0,
    goal: points.length - 1,
  };
}

/** Par moves = shortest route; par rotations = moves plus a difficulty margin. */
function targetFor(sketch: Sketch, rotationBonus: number): { moves: number; rotations: number } {
  const adj = adjacency(sketch.nodes.length, sketch.edges);
  const path = bfsPath(adj, sketch.start!, sketch.goal!)!;
  const moves = path.length - 1;
  return { moves, rotations: moves + rotationBonus };
}

function challenge(
  difficulty: ChallengeDifficulty,
  number: number,
  title: string,
  description: string,
  points: readonly Point[],
  target: [number, number],
  extraEdges: SketchEdge[] = []
): Challenge {
  return {
    id: `${difficulty}-${String(number).padStart(2, "0")}`,
    title,
    description,
    difficulty,
    target: { moves: target[0], rotations: target[1] },
    sketch: route(points, extraEdges),
  };
}

/** Like challenge(), but with a custom start/goal and computed par target. */
function bigChallenge(
  difficulty: ChallengeDifficulty,
  number: number,
  title: string,
  description: string,
  sketch: Sketch,
  rotationBonus: number
): Challenge {
  return {
    id: `${difficulty}-${String(number).padStart(2, "0")}`,
    title,
    description,
    difficulty,
    target: targetFor(sketch, rotationBonus),
    sketch,
  };
}

// --- Shape builders for the large sketches ----------------------------------
// The generator keeps the drawing intact in the first view and only assigns
// depths, so it works best when all edge lengths are similar. These builders
// produce uniform shapes on purpose.

function wavePoints(count: number, x0: number, x1: number, yA: number, yB: number): Point[] {
  const step = (x1 - x0) / (count - 1);
  return Array.from({ length: count }, (_, i) => [r3(x0 + i * step), i % 2 === 0 ? yA : yB]);
}

function ringSketch(
  count: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  chords: SketchEdge[] = []
): Sketch {
  const points: Point[] = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return [r3(cx + Math.cos(a) * rx), r3(cy + Math.sin(a) * ry)];
  });
  const edges: SketchEdge[] = points.map((_, i) => [i, (i + 1) % count]);
  return {
    nodes: points.map(([x, y], id) => ({ id, x, y })),
    edges: [...edges, ...chords],
    start: 0,
    goal: Math.floor(count / 2),
  };
}

interface GridSnake {
  points: Point[];
  rungs: SketchEdge[];
}

/** Grid walked as a serpentine; rungs are the vertical links off the path. */
function gridSnake(
  cols: number,
  rows: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number
): GridSnake {
  const points: Point[] = [];
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      const col = row % 2 === 0 ? c : cols - 1 - c;
      points.push([r3(x0 + col * dx), r3(y0 + row * dy)]);
    }
  }
  const idxOf = (row: number, col: number) =>
    row * cols + (row % 2 === 0 ? col : cols - 1 - col);
  const rungs: SketchEdge[] = [];
  for (let row = 0; row < rows - 1; row++) {
    const turningCol = row % 2 === 0 ? cols - 1 : 0;
    for (let col = 0; col < cols; col++) {
      if (col === turningCol) continue;
      rungs.push([idxOf(row, col), idxOf(row + 1, col)]);
    }
  }
  return { points, rungs };
}

/** A horizontal chain of diamonds sharing their left/right corners. */
function diamondChain(count: number, x0: number, cy: number, dx: number, dy: number): Sketch {
  const points: Point[] = [[r3(x0), cy]];
  const edges: SketchEdge[] = [];
  for (let d = 0; d < count; d++) {
    const left = d * 3;
    const cxd = x0 + dx * (2 * d + 1);
    points.push([r3(cxd), r3(cy - dy)]); // top    = left + 1
    points.push([r3(cxd), r3(cy + dy)]); // bottom = left + 2
    points.push([r3(cxd + dx), cy]); //      right  = left + 3
    edges.push([left, left + 1], [left, left + 2], [left + 1, left + 3], [left + 2, left + 3]);
  }
  return {
    nodes: points.map(([x, y], id) => ({ id, x, y })),
    edges,
    start: 0,
    goal: points.length - 1,
  };
}

/**
 * Two concentric rings. Bridges, optional center links (inner ring indices)
 * and the goal are explicit so the shortest route stays long by design.
 */
function orbitSketch(
  outerCount: number,
  innerCount: number,
  outerR: [number, number],
  innerR: [number, number],
  bridges: SketchEdge[],
  centerLinks: number[] | null,
  goal: number
): Sketch {
  const outer = ringSketch(outerCount, 0.5, 0.5, outerR[0], outerR[1]);
  const innerPoints: Point[] = Array.from({ length: innerCount }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / innerCount;
    return [r3(0.5 + Math.cos(a) * innerR[0]), r3(0.5 + Math.sin(a) * innerR[1])];
  });
  const nodes = [
    ...outer.nodes,
    ...innerPoints.map(([x, y], i) => ({ id: outerCount + i, x, y })),
  ];
  const innerEdges: SketchEdge[] = innerPoints.map((_, i) => [
    outerCount + i,
    outerCount + ((i + 1) % innerCount),
  ]);
  const edges: SketchEdge[] = [...outer.edges, ...innerEdges, ...bridges];
  if (centerLinks) {
    const center = nodes.length;
    nodes.push({ id: center, x: 0.5, y: 0.5 });
    for (const innerIndex of centerLinks) {
      edges.push([outerCount + innerIndex, center]);
    }
  }
  return { nodes, edges, start: 0, goal };
}

const easy: Challenge[] = [
  challenge("easy", 1, "First Line", "A straight introduction to aligned paths.", [[.16,.52],[.38,.52],[.62,.52],[.84,.52]], [3,3]),
  challenge("easy", 2, "Small Step", "Climb a simple diagonal route.", [[.16,.72],[.34,.62],[.5,.5],[.68,.38],[.84,.28]], [4,4]),
  challenge("easy", 3, "Soft Wave", "Follow a gentle path from side to side.", [[.12,.56],[.28,.38],[.44,.58],[.6,.38],[.76,.58],[.88,.42]], [5,5]),
  challenge("easy", 4, "Corner Turn", "One clean corner changes the view.", [[.18,.72],[.4,.72],[.62,.72],[.62,.46],[.62,.22]], [4,4]),
  challenge("easy", 5, "Tiny Peak", "Cross a small mountain-shaped route.", [[.14,.66],[.32,.5],[.5,.28],[.68,.5],[.86,.66]], [4,5]),
  challenge("easy", 6, "Low Bridge", "Move over a wide, shallow bridge.", [[.12,.66],[.28,.66],[.4,.42],[.6,.42],[.72,.66],[.88,.66]], [5,5]),
  challenge("easy", 7, "Open Gate", "Pass through a narrow U-shaped gate.", [[.16,.3],[.16,.68],[.38,.68],[.62,.68],[.84,.68],[.84,.3]], [5,5]),
  challenge("easy", 8, "Side Door", "Use the branch without losing the main route.", [[.14,.52],[.34,.52],[.52,.52],[.52,.28],[.72,.52],[.88,.52]], [5,5], [[2,4]]),
  challenge("easy", 9, "Little Loop", "Choose either side of the first loop.", [[.14,.52],[.32,.3],[.56,.3],[.74,.52],[.56,.72],[.32,.72]], [4,5], [[0,5],[3,4]]),
  challenge("easy", 10, "Crossroads", "Reach the far side through one central crossing.", [[.12,.5],[.34,.5],[.5,.28],[.5,.5],[.5,.72],[.7,.5],[.88,.5]], [4,6], [[1,3],[3,5]]),
];

const medium: Challenge[] = [
  challenge("medium", 1, "Double Bend", "Two corners introduce longer view changes.", [[.12,.72],[.3,.72],[.3,.46],[.48,.46],[.48,.24],[.68,.24],[.86,.24]], [6,6]),
  challenge("medium", 2, "Sawtooth", "Keep a rhythm through alternating peaks.", [[.1,.66],[.23,.35],[.36,.66],[.49,.35],[.62,.66],[.75,.35],[.9,.66]], [6,7]),
  challenge("medium", 3, "Split Rail", "A second rail offers a shorter-looking choice.", [[.1,.55],[.27,.35],[.45,.35],[.62,.55],[.45,.72],[.27,.72],[.78,.55],[.9,.55]], [5,7], [[0,5],[3,4],[3,6]]),
  challenge("medium", 4, "Tall Arch", "Climb and descend a high arch.", [[.1,.72],[.23,.58],[.34,.38],[.46,.2],[.58,.38],[.7,.58],[.83,.72],[.92,.58]], [7,7]),
  challenge("medium", 5, "Inner Lane", "Use the inner connector to avoid the long edge.", [[.12,.25],[.12,.72],[.32,.72],[.5,.56],[.68,.72],[.88,.72],[.88,.25]], [6,7], [[0,3],[3,6]]),
  challenge("medium", 6, "Two Windows", "Two diamond windows share one important route.", [[.06,.5],[.18,.28],[.34,.5],[.18,.72],[.48,.5],[.62,.28],[.78,.5],[.62,.72],[.94,.5]], [6,8], [[0,3],[0,1],[1,2],[2,3],[2,4],[4,7],[4,5],[5,6],[6,7],[6,8]]),
  challenge("medium", 7, "Stairwell", "A compact staircase changes direction halfway.", [[.12,.78],[.28,.78],[.28,.61],[.44,.61],[.44,.44],[.6,.44],[.6,.27],[.76,.27]], [7,7]),
  challenge("medium", 8, "Forked Peak", "Pick the useful branch around the summit.", [[.1,.7],[.25,.52],[.4,.3],[.54,.5],[.68,.28],[.8,.5],[.92,.7]], [6,8], [[2,4]]),
  challenge("medium", 9, "Offset Ring", "The ring is shifted, so every view matters.", [[.1,.52],[.25,.28],[.5,.2],[.72,.34],[.8,.58],[.62,.76],[.36,.72],[.9,.52]], [6,8], [[0,6],[4,7]]),
  challenge("medium", 10, "Central Switch", "Several routes meet at one central switch.", [[.08,.5],[.24,.3],[.42,.5],[.24,.7],[.58,.5],[.72,.28],[.72,.72],[.92,.5]], [5,9], [[0,3],[0,1],[2,3],[2,4],[4,6],[4,5],[5,7],[6,7]]),
];

// Hard: 12-14 platforms. Denser networks, more decoy branches.
const hard: Challenge[] = [
  bigChallenge("hard", 1, "Long Signal",
    "Twelve platforms alternate in a tight signal wave.",
    route(wavePoints(12, 0.04, 0.96, 0.38, 0.62)), 3),
  bigChallenge("hard", 2, "Nested Corner",
    "A serpentine with inner shortcuts that rarely help.",
    (() => {
      const { points, rungs } = gridSnake(4, 3, 0.08, 0.18, 0.24, 0.32);
      // Goal sits on the last row's near corner, away from both shortcuts.
      return { ...route(points, [rungs[2], rungs[5]]), goal: 8 };
    })(), 3),
  bigChallenge("hard", 3, "Broken Orbit",
    "A twelve-platform orbit with three tempting chords.",
    ringSketch(12, 0.5, 0.5, 0.38, 0.32, [[1, 3], [5, 7], [9, 11]]), 4),
  bigChallenge("hard", 4, "Sawtooth Climb",
    "The teeth drift downhill while you climb across.",
    route(wavePoints(12, 0.05, 0.95, 0.3, 0.56).map(([x, y], i) => [x, r3(y + i * 0.014)])), 3),
  bigChallenge("hard", 5, "Dense Ladder",
    "Fourteen platforms; every rung looks equally useful.",
    (() => {
      const { points, rungs } = gridSnake(7, 2, 0.06, 0.4, 0.145, 0.24);
      // Goal is the far corner below the snake's turn, not the snake's end.
      return { ...route(points, rungs.filter((_, i) => i % 2 === 0)), goal: 7 };
    })(), 4),
  bigChallenge("hard", 6, "Diamond Chain",
    "Four linked diamonds hide several false shortcuts.",
    diamondChain(4, 0.06, 0.5, 0.11, 0.18), 4),
  bigChallenge("hard", 7, "Crown Route",
    "A jagged crown with two low return chords.",
    route(wavePoints(12, 0.04, 0.96, 0.62, 0.34), [[0, 2], [9, 11]]), 4),
  bigChallenge("hard", 8, "Twisted Grid",
    "A compact grid rewards planning over instinct.",
    (() => {
      const { points, rungs } = gridSnake(4, 3, 0.1, 0.2, 0.26, 0.3);
      return route(points, [rungs[2], rungs[3]]);
    })(), 4),
  bigChallenge("hard", 9, "Spiral Entry",
    "Circle the outside before dropping into the core.",
    (() => {
      const outer = ringSketch(8, 0.5, 0.5, 0.4, 0.34, [[1, 3]]);
      const inner = ringSketch(4, 0.5, 0.5, 0.17, 0.15);
      const nodes = [...outer.nodes, ...inner.nodes.map((n) => ({ ...n, id: n.id + 8 }))];
      const edges: SketchEdge[] = [
        ...outer.edges,
        ...inner.edges.map(([a, b]) => [a + 8, b + 8] as SketchEdge),
        [4, 8],
      ];
      return { nodes, edges, start: 0, goal: 10 };
    })(), 4),
  bigChallenge("hard", 10, "Twin Hubs",
    "Two five-way hubs linked only through their spokes.",
    (() => {
      const spoke = (cx: number, a: number, r: number): Point =>
        [r3(cx + Math.cos(a) * r), r3(0.5 + Math.sin(a) * r * 0.85)];
      const angles = [(-3 * Math.PI) / 4, (-Math.PI) / 4, (Math.PI) / 4, (3 * Math.PI) / 4];
      const points: Point[] = [
        [0.06, 0.5],                              // 0 start
        [0.3, 0.5],                               // 1 hub A
        ...angles.map((a) => spoke(0.3, a, 0.2)), //  2-5
        [0.5, 0.5],                               // 6 middle
        [0.7, 0.5],                               // 7 hub B
        ...angles.map((a) => spoke(0.7, a, 0.2)), //  8-11
        [0.94, 0.5],                              // 12 goal
      ];
      const edges: SketchEdge[] = [
        [0, 1], [1, 2], [1, 3], [1, 4], [1, 5],
        [4, 6], [6, 8],
        [7, 8], [7, 9], [7, 10], [7, 11],
        [7, 12],
        [3, 8],
      ];
      return { nodes: points.map(([x, y], id) => ({ id, x, y })), edges, start: 0, goal: 12 };
    })(), 4),
];

// Impossible: 16-20 platforms. The biggest, most deceptive networks.
const impossible: Challenge[] = [
  bigChallenge("impossible", 1, "Endless Wave",
    "Sixteen platforms in one relentless zigzag.",
    route(wavePoints(16, 0.04, 0.96, 0.42, 0.66)), 4),
  bigChallenge("impossible", 2, "Deep Spiral",
    "Seventeen platforms wind from the rim to the center.",
    (() => {
      const sketch = orbitSketch(10, 6, [0.42, 0.36], [0.21, 0.18], [[5, 10]], [3], 16);
      sketch.edges.push([1, 3]); // decoy chord near the start
      return sketch;
    })(), 5),
  bigChallenge("impossible", 3, "Quad Diamond",
    "Five diamonds in a row; only one corner sequence works.",
    diamondChain(5, 0.04, 0.5, 0.092, 0.16), 5),
  bigChallenge("impossible", 4, "Twenty Gates",
    "The full twenty platforms as a serpentine of gates.",
    (() => {
      const { points, rungs } = gridSnake(5, 4, 0.08, 0.14, 0.21, 0.22);
      return route(points, [rungs[1], rungs[5], rungs[10]]);
    })(), 5),
  bigChallenge("impossible", 5, "Orbit Network",
    "Two rings, two far bridges, and no obvious order.",
    orbitSketch(12, 5, [0.44, 0.38], [0.19, 0.16], [[6, 12], [5, 16]], null, 14), 5),
  bigChallenge("impossible", 6, "Woven Grid",
    "Twenty platforms woven into a full lattice.",
    (() => {
      const { points, rungs } = gridSnake(5, 4, 0.08, 0.14, 0.21, 0.22);
      // Goal is the far corner of the lattice, diagonal from the start.
      return { ...route(points, rungs), goal: 15 };
    })(), 5),
  bigChallenge("impossible", 7, "False Crown",
    "A wide crown whose chords rarely point home.",
    ringSketch(16, 0.5, 0.5, 0.44, 0.38, [[1, 3], [4, 6], [9, 11], [13, 15]]), 5),
  bigChallenge("impossible", 8, "Switchboard",
    "Three rows of switches feed one exit lane.",
    (() => {
      const { points, rungs } = gridSnake(6, 3, 0.05, 0.2, 0.17, 0.28);
      return route(points, rungs.filter((_, i) => i % 2 === 1));
    })(), 5),
  bigChallenge("impossible", 9, "Fractured Star",
    "A star inside a ring; most spokes are decoys.",
    orbitSketch(12, 5, [0.44, 0.38], [0.19, 0.16], [[6, 12], [7, 14], [8, 10]], null, 16), 6),
  bigChallenge("impossible", 10, "Final Illusion",
    "All twenty platforms. Every view you learned matters.",
    orbitSketch(12, 7, [0.45, 0.4], [0.22, 0.19], [[6, 14], [3, 16], [9, 15]], [0], 19), 6),
];

export const CHALLENGES: Challenge[] = [...easy, ...medium, ...hard, ...impossible];
