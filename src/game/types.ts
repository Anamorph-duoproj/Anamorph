/** Ein Knoten der 2D-Skizze (Koordinaten normalisiert auf 0..1). */
export interface SketchNode {
  id: number;
  x: number;
  y: number;
}

/** Kante zwischen zwei Knoten-IDs. */
export type SketchEdge = [number, number];

/** Die vom Spieler gezeichnete Skizze als Graph. */
export interface Sketch {
  nodes: SketchNode[];
  edges: SketchEdge[];
  start: number | null;
  goal: number | null;
}

/** Maximale Anzahl Plattformen laut Konzept. */
export const MAX_NODES = 12;

/** Anzahl der Snap-Blickwinkel (Yaw in 45°-Schritten). */
export const SNAP_COUNT = 8;

/** Isometrischer Basis-Pitch (klassisch ~35.264°). */
export const BASE_PITCH = Math.atan(1 / Math.SQRT2);

/** Kantenlänge einer Plattform in Weltkoordinaten. */
export const PLATFORM_SIZE = 1.2;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Ein generiertes 3D-Level. */
export interface Level {
  /** 3D-Position pro Knoten, Index = Knoten-Index im Sketch. */
  positions: Vec3[];
  /** Kanten als Index-Paare (Indizes in positions). */
  edges: [number, number][];
  start: number;
  goal: number;
  /** Für jede Kante der Snap-Winkel-Index, bei dem sie sicher aktiv ist (-1 = ungeplant/Zyklus-Kante). */
  edgeSnapHint: number[];
}

export interface ExampleSketch {
  name: string;
  description: string;
  sketch: Sketch;
}
