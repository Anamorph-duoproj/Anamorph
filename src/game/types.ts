export interface SketchNode {
  id: number;
  x: number;
  y: number;
}

export type SketchEdge = [number, number];

export interface Sketch {
  nodes: SketchNode[];
  edges: SketchEdge[];
  start: number | null;
  goal: number | null;
}

export const MAX_NODES = 12;
export const SNAP_COUNT = 8;
export const BASE_PITCH = Math.atan(1 / Math.SQRT2);
export const PLATFORM_SIZE = 1.2;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Level {
  positions: Vec3[];
  edges: [number, number][];
  start: number;
  goal: number;
  edgeSnapHint: number[];
}

export interface ExampleSketch {
  name: string;
  description: string;
  sketch: Sketch;
}

export interface SolveStats {
  moves: number;
  rotations: number;
}
