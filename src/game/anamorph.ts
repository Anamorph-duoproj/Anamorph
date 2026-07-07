import * as THREE from "three";
import { PLATFORM_SIZE, type Level, type Vec3 } from "./types";
import { projectedDistance } from "./view";

/**
 * Toleranz (in Weltkoordinaten der Bildebene), unterhalb derer zwei
 * verbundene Plattformen als "optisch zusammengefallen" gelten.
 */
export const ACTIVE_TOLERANCE = PLATFORM_SIZE * 1.7;

/** Faktor, um den Kanten in der Startansicht MINDESTENS getrennt sein müssen. */
export const START_SEPARATION = ACTIVE_TOLERANCE * 1.35;

/**
 * Aktive Kanten für einen exakten Snap-Winkel (wird vom Generator
 * für die Lösbarkeitsprüfung benutzt — identische Mathematik wie zur Laufzeit).
 */
export function activeEdgesAtSnap(level: Level, snapIndex: number): boolean[] {
  return level.edges.map(([a, b]) =>
    projectedDistance(level.positions[a], level.positions[b], snapIndex) < ACTIVE_TOLERANCE
  );
}

const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();

/**
 * Laufzeit-Check: projiziert beide Endpunkte einer Kante über die
 * Three.js-Kamera auf Bildschirmkoordinaten und prüft, ob sie innerhalb
 * der Toleranz zusammenfallen.
 *
 * @param zoom  Pixel pro Weltkoordinaten-Einheit der Orthokamera.
 */
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
