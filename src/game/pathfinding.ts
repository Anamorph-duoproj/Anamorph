/** Adjazenzliste aus einer Kantenliste (optional gefiltert auf aktive Kanten). */
export function adjacency(
  nodeCount: number,
  edges: [number, number][],
  activeMask?: boolean[]
): number[][] {
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  edges.forEach(([a, b], i) => {
    if (activeMask && !activeMask[i]) return;
    adj[a].push(b);
    adj[b].push(a);
  });
  return adj;
}

/** BFS: kürzester Pfad von from nach to; null, wenn unerreichbar. */
export function bfsPath(adj: number[][], from: number, to: number): number[] | null {
  if (from === to) return [from];
  const prev = new Array<number>(adj.length).fill(-1);
  const visited = new Array<boolean>(adj.length).fill(false);
  visited[from] = true;
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    for (const m of adj[n]) {
      if (visited[m]) continue;
      visited[m] = true;
      prev[m] = n;
      if (m === to) {
        const path = [to];
        let c = to;
        while (prev[c] !== -1) {
          c = prev[c];
          path.push(c);
        }
        return path.reverse();
      }
      queue.push(m);
    }
  }
  return null;
}

/** BFS-Distanzen von einem Startknoten zu allen anderen (Infinity = unerreichbar). */
export function bfsDistances(adj: number[][], from: number): number[] {
  const dist = new Array<number>(adj.length).fill(Infinity);
  dist[from] = 0;
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    for (const m of adj[n]) {
      if (dist[m] !== Infinity) continue;
      dist[m] = dist[n] + 1;
      queue.push(m);
    }
  }
  return dist;
}

/**
 * Bewegungsziel der Figur: BFS über aktive Kanten Richtung Ziel.
 * Erreicht die Suche das Ziel nicht, läuft die Figur zum erreichbaren
 * Knoten mit der geringsten Distanz zum Ziel im Gesamtgraphen.
 */
export function planWalk(
  nodeCount: number,
  edges: [number, number][],
  activeMask: boolean[],
  from: number,
  goal: number,
  goalDistances: number[]
): number[] | null {
  const activeAdj = adjacency(nodeCount, edges, activeMask);
  const direct = bfsPath(activeAdj, from, goal);
  if (direct) return direct;

  const reachable = bfsDistances(activeAdj, from);
  let best = from;
  for (let n = 0; n < nodeCount; n++) {
    if (reachable[n] === Infinity) continue;
    if (
      goalDistances[n] < goalDistances[best] ||
      (goalDistances[n] === goalDistances[best] && reachable[n] < reachable[best])
    ) {
      best = n;
    }
  }
  if (best === from) return null;
  return bfsPath(activeAdj, from, best);
}
