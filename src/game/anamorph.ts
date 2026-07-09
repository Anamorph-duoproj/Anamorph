import * as THREE from "three";
import { PLATFORM_SIZE, type Level, type Vec3 } from "./types.ts";
import { projectedDistance } from "./view.ts";

export const ACTIVE_TOLERANCE = PLATFORM_SIZE * 1.7;
export const START_SEPARATION = ACTIVE_TOLERANCE * 1.35;

export function activeEdgesAtSnap(level: Level, snapIndex: number): boolean[] {
  return level.edges.map(([a, b]) =>
    projectedDistance(level.positions[a], level.positions[b], snapIndex) < ACTIVE_TOLERANCE
  );
}

const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();

export function activeEdgesForCamera(
  level: Level,
  camera: THREE.Camera,
  zoom: number,
  viewportW: number,
  viewportH: number
): boolean[] {
  const tolerancePx = ACTIVE_TOLERANCE * zoom;
  return level.edges.map(([a, b]) => {
    const pa = toScreen(level.positions[a], camera, viewportW, viewportH, _va);
    const pb = toScreen(level.positions[b], camera, viewportW, viewportH, _vb);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y) < tolerancePx;
  });
}

function toScreen(
  p: Vec3,
  camera: THREE.Camera,
  w: number,
  h: number,
  tmp: THREE.Vector3
): { x: number; y: number } {
  tmp.set(p.x, p.y, p.z).project(camera);
  return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h };
}
