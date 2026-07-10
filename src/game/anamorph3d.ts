import * as THREE from "three";
import { type Level, type Vec3 } from "./types.ts";
import { ACTIVE_TOLERANCE } from "./anamorph.ts";

// The Three.js-dependent half of the anamorphosis check. Kept separate from
// anamorph.ts so the main bundle (sketching, generator, tests) stays free of
// Three.js; only the lazily loaded 3D scene pulls this in.

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
