import { PLATFORM_SIZE, type Level } from "./types.ts";
import { projectedDistance } from "./view.ts";

export const ACTIVE_TOLERANCE = PLATFORM_SIZE * 1.7;
export const START_SEPARATION = ACTIVE_TOLERANCE * 1.35;

export function activeEdgesAtSnap(level: Level, snapIndex: number): boolean[] {
  return level.edges.map(([a, b]) =>
    projectedDistance(level.positions[a], level.positions[b], snapIndex) < ACTIVE_TOLERANCE
  );
}
