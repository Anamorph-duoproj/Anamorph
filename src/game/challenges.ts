import type { Sketch, SketchEdge } from "./types";

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
    label: "Einfach",
    description: "Short routes for learning how views connect.",
    color: "#23785e",
    softColor: "#dff6ed",
  },
  {
    id: "medium",
    label: "Mittel",
    description: "Longer paths with useful branches and choices.",
    color: "#356f8b",
    softColor: "#dfedf5",
  },
  {
    id: "hard",
    label: "Schwierig",
    description: "Dense networks that need deliberate rotations.",
    color: "#8a6230",
    softColor: "#f8edcf",
  },
  {
    id: "impossible",
    label: "Impossible",
    description: "The largest sketches with deceptive alternate routes.",
    color: "#994a5c",
    softColor: "#fae3e8",
  },
];

type Point = readonly [number, number];

function route(points: readonly Point[], extraEdges: SketchEdge[] = []): Sketch {
  const pathEdges: SketchEdge[] = points.slice(1).map((_, index) => [index, index + 1]);
  return {
    nodes: points.map(([x, y], id) => ({ id, x, y })),
    edges: [...pathEdges, ...extraEdges],
    start: 0,
    goal: points.length - 1,
  };
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

const hard: Challenge[] = [
  challenge("hard", 1, "Long Signal", "A long wave leaves little room for wasted turns.", [[.06,.6],[.16,.32],[.27,.66],[.38,.3],[.49,.67],[.6,.29],[.71,.65],[.82,.33],[.94,.58]], [8,9]),
  challenge("hard", 2, "Nested Corner", "Corners fold back through the center.", [[.1,.18],[.1,.78],[.28,.78],[.28,.35],[.48,.35],[.48,.66],[.68,.66],[.68,.22],[.9,.22]], [8,9]),
  challenge("hard", 3, "Three Bridges", "Three crossings compete for the same route.", [[.06,.68],[.2,.4],[.34,.68],[.48,.4],[.62,.68],[.76,.4],[.92,.68],[.76,.2],[.92,.2]], [7,10], [[1,3],[3,5],[5,7],[7,8]]),
  challenge("hard", 4, "Broken Orbit", "Repair the route through an open circular network.", [[.08,.5],[.18,.24],[.42,.14],[.66,.2],[.82,.42],[.78,.68],[.54,.82],[.3,.76],[.14,.66]], [8,10], [[0,8],[2,7],[3,6]]),
  challenge("hard", 5, "Diamond Chain", "Linked diamonds hide several false shortcuts.", [[.05,.5],[.18,.25],[.34,.5],[.18,.75],[.5,.25],[.66,.5],[.5,.75],[.82,.25],[.95,.5]], [6,11], [[0,3],[0,1],[1,2],[2,3],[2,4],[2,6],[4,5],[5,6],[5,7],[7,8]]),
  challenge("hard", 6, "Dense Ladder", "Switch between both sides of a crowded ladder.", [[.1,.18],[.1,.42],[.1,.68],[.3,.68],[.3,.42],[.3,.18],[.55,.18],[.55,.42],[.55,.68],[.82,.68]], [7,11], [[0,5],[1,4],[2,3],[5,6],[4,7],[3,8],[8,9]]),
  challenge("hard", 7, "Crown Route", "Cross a crown with three connected peaks.", [[.05,.7],[.18,.35],[.32,.62],[.45,.22],[.58,.62],[.72,.35],[.86,.7],[.72,.78],[.94,.78]], [8,10], [[0,2],[2,4],[4,6],[6,7]]),
  challenge("hard", 8, "Twisted Grid", "A small grid rewards careful route planning.", [[.12,.2],[.38,.2],[.64,.2],[.82,.38],[.64,.5],[.38,.5],[.12,.5],[.38,.78],[.68,.78]], [7,11], [[0,6],[1,5],[2,4],[4,8],[5,7],[7,8]]),
  challenge("hard", 9, "Spiral Entry", "Work inward before escaping to the goal.", [[.12,.2],[.38,.2],[.66,.2],[.86,.36],[.86,.64],[.66,.78],[.38,.78],[.2,.62],[.2,.4],[.46,.4]], [9,11]),
  challenge("hard", 10, "Five-Way Hub", "A busy hub connects every important branch.", [[.06,.5],[.22,.22],[.22,.78],[.46,.5],[.48,.16],[.48,.84],[.7,.28],[.7,.72],[.92,.5]], [6,12], [[0,2],[0,1],[1,3],[2,3],[3,4],[3,5],[3,6],[3,7],[6,8],[7,8]]),
];

const impossible: Challenge[] = [
  challenge("impossible", 1, "Endless Wave", "Ten platforms alternate across the full page.", [[.04,.62],[.14,.25],[.24,.7],[.34,.22],[.44,.72],[.54,.2],[.64,.7],[.74,.24],[.84,.68],[.95,.3]], [9,12]),
  challenge("impossible", 2, "Deep Spiral", "A long spiral closes tightly around its center.", [[.08,.16],[.34,.16],[.62,.16],[.86,.28],[.88,.56],[.76,.8],[.48,.84],[.22,.76],[.1,.52],[.22,.32],[.48,.3],[.66,.42]], [11,13]),
  challenge("impossible", 3, "Triple Diamond", "Three linked diamonds create many tempting routes.", [[.03,.5],[.14,.22],[.27,.5],[.14,.78],[.4,.22],[.53,.5],[.4,.78],[.66,.22],[.79,.5],[.66,.78],[.94,.5]], [8,14], [[0,3],[0,1],[1,2],[2,3],[2,4],[2,6],[4,5],[5,6],[5,7],[5,9],[7,8],[8,9]]),
  challenge("impossible", 4, "Twelve Gates", "A maximum-size zigzag with hidden connectors.", [[.04,.2],[.12,.78],[.2,.2],[.28,.78],[.36,.2],[.44,.78],[.52,.2],[.6,.78],[.68,.2],[.76,.78],[.84,.2],[.92,.78]], [9,15], [[0,2],[2,4],[4,6],[6,8],[8,10],[1,3],[3,5],[5,7],[7,9],[9,11]]),
  challenge("impossible", 5, "Orbit Network", "Outer and inner rings share rotating gateways.", [[.06,.5],[.14,.2],[.42,.08],[.72,.14],[.92,.4],[.86,.72],[.58,.88],[.28,.82],[.1,.66],[.34,.34],[.62,.32],[.6,.62]], [9,15], [[0,8],[1,9],[2,9],[3,10],[4,10],[5,11],[6,11],[7,9],[9,10],[10,11]]),
  challenge("impossible", 6, "Woven Grid", "Three rows weave into a dense route network.", [[.08,.18],[.34,.18],[.6,.18],[.88,.18],[.88,.5],[.6,.5],[.34,.5],[.08,.5],[.08,.8],[.34,.8],[.6,.8],[.88,.8]], [9,16], [[0,7],[1,6],[2,5],[3,4],[4,11],[5,10],[6,9],[7,8],[8,9],[9,10],[10,11]]),
  challenge("impossible", 7, "False Crown", "A crown of shortcuts conceals the reliable route.", [[.04,.74],[.14,.34],[.26,.66],[.38,.2],[.5,.66],[.62,.2],[.74,.66],[.86,.34],[.96,.74],[.74,.84],[.5,.82],[.26,.84]], [9,16], [[0,2],[2,4],[4,6],[6,8],[8,9],[9,10],[10,11],[11,0],[3,10],[5,10]]),
  challenge("impossible", 8, "Switchboard", "Every lane feeds a central switching network.", [[.04,.22],[.04,.5],[.04,.78],[.28,.22],[.28,.5],[.28,.78],[.56,.22],[.56,.5],[.56,.78],[.82,.22],[.82,.5],[.94,.78]], [8,17], [[0,3],[1,4],[2,5],[3,6],[4,7],[5,8],[6,9],[7,10],[8,11],[0,1],[1,2],[3,4],[4,5],[6,7],[7,8],[9,10],[10,11]]),
  challenge("impossible", 9, "Fractured Star", "A split star has several near-identical branches.", [[.05,.5],[.24,.38],[.34,.1],[.48,.36],[.7,.16],[.66,.44],[.92,.5],[.66,.6],[.76,.86],[.48,.68],[.3,.9],[.24,.62]], [8,17], [[0,11],[0,1],[1,2],[1,3],[3,4],[3,5],[5,6],[6,7],[7,8],[7,9],[9,10],[9,11],[1,11],[3,9],[5,7]]),
  challenge("impossible", 10, "Final Illusion", "The full network tests every view you have learned.", [[.04,.5],[.14,.16],[.34,.3],[.5,.08],[.66,.3],[.86,.16],[.96,.5],[.84,.82],[.64,.68],[.5,.92],[.34,.68],[.16,.82]], [9,18], [[0,11],[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[0,2],[2,4],[4,6],[6,8],[8,10],[10,0]]),
];

export const CHALLENGES: Challenge[] = [...easy, ...medium, ...hard, ...impossible];
