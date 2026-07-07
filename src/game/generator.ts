import {
  MAX_NODES,
  PLATFORM_SIZE,
  SNAP_COUNT,
  type Level,
  type Sketch,
  type Vec3,
} from "./types.ts";
import { viewDir, viewRight, viewUp, projectedDistance } from "./view.ts";
import { activeEdgesAtSnap, ACTIVE_TOLERANCE, START_SEPARATION } from "./anamorph.ts";
import { adjacency, bfsPath, bfsDistances, planWalk } from "./pathfinding.ts";

export type GenerateResult =
  | { ok: true; level: Level }
  | { ok: false; reason: string };

/** Deterministischer RNG (mulberry32), damit Versuche reproduzierbar sind. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Prüft die Skizze, bevor generiert wird. Gibt null zurück, wenn alles ok ist. */
export function validateSketch(sketch: Sketch): string | null {
  if (sketch.nodes.length < 2) return "Zeichne mindestens zwei Plattformen.";
  if (sketch.nodes.length > MAX_NODES)
    return `Zu viele Plattformen — maximal ${MAX_NODES} erlaubt.`;
  if (sketch.start === null) return "Markiere einen Startpunkt.";
  if (sketch.goal === null) return "Markiere einen Zielpunkt.";
  if (sketch.start === sketch.goal)
    return "Start und Ziel müssen verschiedene Plattformen sein.";

  const idToIndex = new Map(sketch.nodes.map((n, i) => [n.id, i]));
  const edges = sketch.edges.map(
    ([a, b]) => [idToIndex.get(a)!, idToIndex.get(b)!] as [number, number]
  );
  const adj = adjacency(sketch.nodes.length, edges);
  const startIdx = idToIndex.get(sketch.start)!;
  const goalIdx = idToIndex.get(sketch.goal)!;
  if (!bfsPath(adj, startIdx, goalIdx))
    return "Start und Ziel müssen über Wege verbunden sein.";
  const dist = bfsDistances(adj, startIdx);
  if (dist.some((d) => d === Infinity))
    return "Alle Plattformen müssen mit dem Weg-Netz verbunden sein.";
  return null;
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dist3 = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Wandelt die Skizze in ein 3D-Level um.
 *
 * Kern-Idee: Für jede Spannbaum-Kante wird ein Snap-Winkel gewählt und der
 * Kind-Knoten entlang der Blickrichtung dieses Winkels versetzt platziert —
 * plus ein Versatz von ca. einer Plattformbreite in der Bildebene. Aus genau
 * diesem Winkel erscheinen die beiden Plattformen dadurch direkt benachbart
 * ("anamorphotisch verbunden"), aus allen anderen Winkeln liegen sie sichtbar
 * auseinander. Winkel 0 (Startansicht) wird nie vergeben, und ein Constraint
 * erzwingt dort deutliche Trennung.
 */
export function generateLevel(sketch: Sketch, baseSeed = 1): GenerateResult {
  const invalid = validateSketch(sketch);
  if (invalid) return { ok: false, reason: invalid };

  const n = sketch.nodes.length;
  const idToIndex = new Map(sketch.nodes.map((node, i) => [node.id, i]));
  const edges = sketch.edges.map(
    ([a, b]) => [idToIndex.get(a)!, idToIndex.get(b)!] as [number, number]
  );
  const start = idToIndex.get(sketch.start!)!;
  const goal = idToIndex.get(sketch.goal!)!;

  // Spannbaum per BFS vom ZIEL aus (Reihenfolge = Platzierungsreihenfolge).
  // Dadurch führt jede Baum-Kante von einem Knoten zu einem Knoten, der dem
  // Ziel im Gesamtgraphen strikt näher ist — die Figur findet also von jeder
  // Position aus an irgendeinem Snap-Winkel einen Fortschritts-Zug:
  // Lösbarkeit per Konstruktion.
  const adj: { to: number; edgeIdx: number }[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], i) => {
    adj[a].push({ to: b, edgeIdx: i });
    adj[b].push({ to: a, edgeIdx: i });
  });
  const treeOrder: { parent: number; child: number; edgeIdx: number }[] = [];
  {
    const visited = new Array<boolean>(n).fill(false);
    visited[goal] = true;
    const queue = [goal];
    while (queue.length) {
      const c = queue.shift()!;
      for (const { to, edgeIdx } of adj[c]) {
        if (visited[to]) continue;
        visited[to] = true;
        treeOrder.push({ parent: c, child: to, edgeIdx });
        queue.push(to);
      }
    }
  }

  const MAX_ATTEMPTS = 300;
  let best: { level: Level; score: number } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = mulberry32(baseSeed * 7919 + attempt * 104729 + 13);
    const positions: Vec3[] = new Array(n);
    const edgeSnapHint = new Array<number>(edges.length).fill(-1);
    positions[goal] = { x: 0, y: 0, z: 0 };

    for (const { parent, child, edgeIdx } of treeOrder) {
      // Snap-Winkel 1..7 — die Startansicht (0) bleibt immer "zerfallen".
      const snap = 1 + Math.floor(rng() * (SNAP_COUNT - 1));
      edgeSnapHint[edgeIdx] = snap;

      const depth = (2.2 + rng() * 2.3) * (rng() < 0.5 ? -1 : 1);
      // Versatz in der Bildebene: überwiegend seitlich, leicht vertikal,
      // Betrag ~ eine Plattformbreite => Plattformen erscheinen benachbart.
      const psi = (rng() - 0.5) * (Math.PI / 2.2) + (rng() < 0.5 ? 0 : Math.PI);
      const mag = PLATFORM_SIZE * (1.0 + rng() * 0.25);
      const r = viewRight(snap);
      const u = viewUp(snap);
      const offset = add(
        scale(r, Math.cos(psi) * mag),
        scale(u, Math.sin(psi) * mag)
      );
      positions[child] = add(
        add(positions[parent], scale(viewDir(snap), depth)),
        offset
      );
    }

    // Struktur um den Schwerpunkt zentrieren (Rotations-Pivot).
    const centroid = positions.reduce((acc, p) => add(acc, p), { x: 0, y: 0, z: 0 });
    const center = scale(centroid, 1 / n);
    const centered = positions.map((p) => ({
      x: p.x - center.x,
      y: p.y - center.y,
      z: p.z - center.z,
    }));

    const level: Level = { positions: centered, edges, start, goal, edgeSnapHint };

    // Harte Bedingungen: lösbar und in der Startansicht "zerfallen".
    if (!isSolvable(level) || !startViewClean(level)) continue;

    const score = softScore(level);
    if (score === 0) return { ok: true, level };
    if (!best || score < best.score) best = { level, score };
  }

  // Kein perfekter Versuch: nimm den besten, der die harten Bedingungen erfüllt.
  if (best) return { ok: true, level: best.level };
  return {
    ok: false,
    reason:
      "Die Skizze ist zu komplex für eine saubere 3D-Struktur — vereinfache sie (weniger Plattformen oder Wege).",
  };
}

/**
 * Weicher Qualitäts-Score eines Versuchs (0 = perfekt). Die harten
 * Bedingungen (Lösbarkeit, saubere Startansicht) prüft der Aufrufer.
 */
function softScore(level: Level): number {
  let v = 0;
  const { positions, edges, edgeSnapHint } = level;

  // (a) Plattformen sollen sich in 3D nicht durchdringen — stark gewichtet.
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (dist3(positions[i], positions[j]) < PLATFORM_SIZE * 1.5) v += 8;
    }
  }

  // (b) Kanten sollen in der Startansicht mit Sicherheitsmarge getrennt sein.
  for (const [a, b] of edges) {
    if (projectedDistance(positions[a], positions[b], 0) < START_SEPARATION) v += 1;
  }

  // (c) Jede Spannbaum-Kante muss an ihrem Winkel wirklich aktiv sein
  //     (per Konstruktion erfüllt — Verstoß wäre ein Logikfehler).
  edges.forEach(([a, b], i) => {
    const snap = edgeSnapHint[i];
    if (snap < 0) return;
    if (projectedDistance(positions[a], positions[b], snap) >= ACTIVE_TOLERANCE) v += 10;
  });

  // (d) Unverbundene Plattformen sollen an keinem Snap-Winkel exakt
  //     übereinander liegen (visuelle Verwechslungsgefahr).
  const connected = new Set(edges.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`));
  for (let s = 0; s < SNAP_COUNT; s++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (connected.has(`${i}:${j}`)) continue;
        if (projectedDistance(positions[i], positions[j], s) < PLATFORM_SIZE * 0.8) v += 1;
      }
    }
  }

  return v;
}

/**
 * Lösbarkeitsprüfung gegen die echte Bewegungs-Policy des Spiels:
 * Die Figur läuft nur Wege, die sie dem Ziel näherbringen (planWalk).
 * Ein Level ist also erst dann garantiert lösbar, wenn von JEDEM Knoten,
 * den die Figur so erreichen kann, mindestens ein Snap-Winkel existiert,
 * an dem planWalk einen Fortschritts-Zug liefert — bis zum Ziel.
 *
 * (Die reine Vereinigung aktiver Kanten über alle Winkel wäre zu schwach:
 * sie erlaubt Pfade, die zwischenzeitlich vom Ziel wegführen, welche die
 * Figur nie laufen würde — sie könnte in einer Sackgasse stranden.)
 */
export function isSolvable(level: Level): boolean {
  const n = level.positions.length;

  // Schneller Vorfilter: ohne Union-Verbindung ist nichts zu holen.
  const union = new Array<boolean>(level.edges.length).fill(false);
  const masks: boolean[][] = [];
  for (let s = 0; s < SNAP_COUNT; s++) {
    const mask = activeEdgesAtSnap(level, s);
    masks.push(mask);
    mask.forEach((a, i) => {
      if (a) union[i] = true;
    });
  }
  const unionAdj = adjacency(n, level.edges, union);
  if (bfsPath(unionAdj, level.start, level.goal) === null) return false;

  const goalDistances = bfsDistances(adjacency(n, level.edges), level.goal);

  // Alle unter der Policy erreichbaren Figuren-Positionen durchspielen.
  const visited = new Array<boolean>(n).fill(false);
  visited[level.start] = true;
  const queue = [level.start];
  while (queue.length) {
    const node = queue.shift()!;
    if (node === level.goal) continue;
    let canProgress = false;
    for (const mask of masks) {
      const path = planWalk(n, level.edges, mask, node, level.goal, goalDistances);
      if (!path || path.length < 2) continue;
      canProgress = true;
      const end = path[path.length - 1];
      if (!visited[end]) {
        visited[end] = true;
        queue.push(end);
      }
    }
    // Sackgasse: Figur kann hier landen, kommt aber nie mehr voran.
    if (!canProgress) return false;
  }
  return true;
}

/** In der Startansicht darf keine Kante aktiv sein. */
function startViewClean(level: Level): boolean {
  return activeEdgesAtSnap(level, 0).every((a) => !a);
}
