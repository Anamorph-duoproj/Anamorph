import {
  MAX_NODES,
  PLATFORM_SIZE,
  SNAP_COUNT,
  type Level,
  type Sketch,
  type Vec3,
} from "./types.ts";
import { projectToView, projectedDistance, viewDir, viewRight, viewUp } from "./view.ts";
import { activeEdgesAtSnap, ACTIVE_TOLERANCE, START_SEPARATION } from "./anamorph.ts";
import { adjacency, bfsPath, bfsDistances, planWalk } from "./pathfinding.ts";

export type GenerateResult =
  | { ok: true; level: Level }
  | { ok: false; reason: string };

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

export function validateSketch(sketch: Sketch): string | null {
  if (sketch.nodes.length < 2) return "Draw at least two platforms.";
  if (sketch.nodes.length > MAX_NODES)
    return `Too many platforms. Maximum allowed: ${MAX_NODES}.`;
  if (sketch.start === null) return "Mark a start platform.";
  if (sketch.goal === null) return "Mark a goal platform.";
  if (sketch.start === sketch.goal)
    return "Start and goal must be different platforms.";

  const idToIndex = new Map(sketch.nodes.map((n, i) => [n.id, i]));
  const edges = sketch.edges.map(
    ([a, b]) => [idToIndex.get(a)!, idToIndex.get(b)!] as [number, number]
  );
  const adj = adjacency(sketch.nodes.length, edges);
  const startIdx = idToIndex.get(sketch.start)!;
  const goalIdx = idToIndex.get(sketch.goal)!;
  if (!bfsPath(adj, startIdx, goalIdx))
    return "Start and goal must be connected by paths.";
  const dist = bfsDistances(adj, startIdx);
  if (dist.some((d) => d === Infinity))
    return "All platforms must be connected to the path network.";
  return null;
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dist3 = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function sketchPositions(sketch: Sketch, edges: [number, number][]): Vec3[] {
  const shortestEdge = Math.min(
    ...edges.map(([a, b]) =>
      Math.hypot(
        sketch.nodes[a].x - sketch.nodes[b].x,
        sketch.nodes[a].y - sketch.nodes[b].y
      )
    )
  );
  const drawingScale = (START_SEPARATION + PLATFORM_SIZE * 0.45) / shortestEdge;
  const right = viewRight(0);
  const up = viewUp(0);

  return sketch.nodes.map((node) =>
    add(
      scale(right, (node.x - 0.5) * drawingScale),
      scale(up, (0.5 - node.y) * drawingScale)
    )
  );
}

function depthForSnap(baseDelta: Vec3, snap: number): { depth: number; residual: number } | null {
  const projectedBase = projectToView(baseDelta, snap);
  const projectedDepth = projectToView(viewDir(0), snap);
  const denominator = projectedDepth.u ** 2 + projectedDepth.v ** 2;
  if (denominator < 1e-7) return null;

  const depth = -(
    projectedBase.u * projectedDepth.u + projectedBase.v * projectedDepth.v
  ) / denominator;
  const residual = Math.hypot(
    projectedBase.u + projectedDepth.u * depth,
    projectedBase.v + projectedDepth.v * depth
  );
  return { depth, residual };
}

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
  const basePositions = sketchPositions(sketch, edges);

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

  const MAX_ATTEMPTS = 180;
  let best: { level: Level; score: number } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = mulberry32(baseSeed * 7919 + attempt * 104729 + 13);
    const depths = new Array<number>(n).fill(Number.NaN);
    const edgeSnapHint = new Array<number>(edges.length).fill(-1);
    depths[goal] = 0;

    for (const { parent, child, edgeIdx } of treeOrder) {
      const baseDelta = subtract(basePositions[child], basePositions[parent]);
      const candidates = Array.from({ length: SNAP_COUNT - 1 }, (_, index) => index + 1)
        .map((snap) => ({ snap, result: depthForSnap(baseDelta, snap) }))
        .filter((candidate): candidate is { snap: number; result: { depth: number; residual: number } } =>
          candidate.result !== null
        )
        .sort((a, b) => a.result.residual - b.result.residual);

      const activeCandidates = candidates.filter(
        (candidate) => candidate.result.residual < ACTIVE_TOLERANCE * 0.92
      );
      const candidatePool = activeCandidates.length > 0 ? activeCandidates : candidates.slice(0, 1);
      const selected = candidatePool[Math.floor(rng() * candidatePool.length)];
      edgeSnapHint[edgeIdx] = selected.snap;
      depths[child] = depths[parent] + selected.result.depth;
    }

    const positions = basePositions.map((position, index) =>
      add(position, scale(viewDir(0), depths[index]))
    );

    const centroid = positions.reduce((acc, p) => add(acc, p), { x: 0, y: 0, z: 0 });
    const center = scale(centroid, 1 / n);
    const centered = positions.map((p) => ({
      x: p.x - center.x,
      y: p.y - center.y,
      z: p.z - center.z,
    }));

    const level: Level = { positions: centered, edges, start, goal, edgeSnapHint };

    if (!isSolvable(level) || !startViewClean(level)) continue;

    const score = softScore(level);
    if (score === 0) return { ok: true, level };
    if (!best || score < best.score) best = { level, score };
  }

  if (best) return { ok: true, level: best.level };
  return {
    ok: false,
    reason:
      "The sketch is too complex for a clean 3D structure. Simplify it with fewer platforms or paths.",
  };
}

function softScore(level: Level): number {
  let v = 0;
  const { positions, edges, edgeSnapHint } = level;

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (dist3(positions[i], positions[j]) < PLATFORM_SIZE * 1.5) v += 8;
    }
  }

  for (const [a, b] of edges) {
    if (projectedDistance(positions[a], positions[b], 0) < START_SEPARATION) v += 1;
  }

  edges.forEach(([a, b], i) => {
    const snap = edgeSnapHint[i];
    if (snap < 0) return;
    if (projectedDistance(positions[a], positions[b], snap) >= ACTIVE_TOLERANCE) v += 10;
  });

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

export function isSolvable(level: Level): boolean {
  const n = level.positions.length;

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
    if (!canProgress) return false;
  }
  return true;
}

function startViewClean(level: Level): boolean {
  return activeEdgesAtSnap(level, 0).every((a) => !a);
}
