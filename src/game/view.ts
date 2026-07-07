import { BASE_PITCH, SNAP_COUNT, type Vec3 } from "./types.ts";

/** Yaw-Winkel (rad) für einen Snap-Index. */
export function snapYaw(index: number): number {
  return (index * 2 * Math.PI) / SNAP_COUNT;
}

/** Kamera-Offset-Richtung (vom Zentrum zur Kamera) für yaw/pitch. */
export function cameraOffset(yaw: number, pitch: number): Vec3 {
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: Math.cos(yaw) * Math.cos(pitch),
  };
}

/** Blickrichtung der Kamera (Kamera -> Zentrum) für einen Snap-Index. */
export function viewDir(snapIndex: number): Vec3 {
  const o = cameraOffset(snapYaw(snapIndex), BASE_PITCH);
  return { x: -o.x, y: -o.y, z: -o.z };
}

/** Rechts-Vektor der Bildebene für einen Snap-Index. */
export function viewRight(snapIndex: number): Vec3 {
  const yaw = snapYaw(snapIndex);
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

/** Hoch-Vektor der Bildebene für einen Snap-Index. */
export function viewUp(snapIndex: number): Vec3 {
  const yaw = snapYaw(snapIndex);
  const p = BASE_PITCH;
  return {
    x: -Math.sin(yaw) * Math.sin(p),
    y: Math.cos(p),
    z: -Math.cos(yaw) * Math.sin(p),
  };
}

/**
 * Orthografische 2D-Projektion eines Weltpunkts in die Bildebene
 * eines Snap-Winkels (Einheit: Weltkoordinaten).
 */
export function projectToView(p: Vec3, snapIndex: number): { u: number; v: number } {
  const r = viewRight(snapIndex);
  const u = viewUp(snapIndex);
  return {
    u: p.x * r.x + p.y * r.y + p.z * r.z,
    v: p.x * u.x + p.y * u.y + p.z * u.z,
  };
}

/** Abstand zweier Punkte in der Bildebene eines Snap-Winkels. */
export function projectedDistance(a: Vec3, b: Vec3, snapIndex: number): number {
  const pa = projectToView(a, snapIndex);
  const pb = projectToView(b, snapIndex);
  return Math.hypot(pa.u - pb.u, pa.v - pb.v);
}
