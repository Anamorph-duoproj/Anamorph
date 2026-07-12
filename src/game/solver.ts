import { SNAP_COUNT, type Level } from "./types.ts";
import { activeEdgesAtSnap } from "./anamorph.ts";
import { adjacency, bfsDistances, planWalk } from "./pathfinding.ts";

export interface SolveCost {
  rotations: number;
  moves: number;
}

// Larger than any realistic move count, so lexicographic (rotations, moves)
// comparison can be packed into a single scalar priority.
const MOVE_CAP = 100000;
const priority = (c: SolveCost) => c.rotations * MOVE_CAP + c.moves;

/**
 * Minimum-effort solve of a generated level under the real game mechanics:
 *
 * - The player is always looking from one of the 8 snap views. Rotating to a
 *   *different* view costs 1 rotation (a drag or arrow key lands on a view;
 *   distance does not matter, matching GameScene's registerSnap).
 * - A tap runs planWalk for the current view and walks the figure toward the
 *   goal; its cost in "moves" is the number of edges traversed.
 *
 * Returns the lexicographically smallest (rotations, then moves) cost that
 * reaches the goal, or null if the level cannot be solved at all. Used both to
 * calibrate challenge budgets and to rate a player's run against the optimum.
 */
export function optimalSolve(level: Level): SolveCost | null {
  const n = level.positions.length;
  const goalDistances = bfsDistances(adjacency(n, level.edges), level.goal);

  // Per view: the tap outcome from every node (destination + edges walked).
  const tap: Array<Array<{ to: number; moves: number } | null>> = [];
  for (let v = 0; v < SNAP_COUNT; v++) {
    const mask = activeEdgesAtSnap(level, v);
    const row: Array<{ to: number; moves: number } | null> = [];
    for (let u = 0; u < n; u++) {
      const path = planWalk(n, level.edges, mask, u, level.goal, goalDistances);
      row.push(path && path.length > 1 ? { to: path[path.length - 1], moves: path.length - 1 } : null);
    }
    tap.push(row);
  }

  // Dijkstra over states (node, view). The game starts at the start node with
  // view 0 already selected (no rotation spent yet).
  const stateId = (node: number, view: number) => node * SNAP_COUNT + view;
  const best = new Array<number>(n * SNAP_COUNT).fill(Infinity);
  const start = stateId(level.start, 0);
  best[start] = 0;

  // Simple array-based priority queue is plenty for <= 20 * 8 states.
  const queue: Array<{ node: number; view: number; cost: SolveCost }> = [
    { node: level.start, view: 0, cost: { rotations: 0, moves: 0 } },
  ];

  let goalCost: SolveCost | null = null;
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) {
      if (priority(queue[i].cost) < priority(queue[bi].cost)) bi = i;
    }
    const { node, view, cost } = queue.splice(bi, 1)[0];
    if (priority(cost) > best[stateId(node, view)]) continue;

    if (node === level.goal) {
      goalCost = cost;
      break;
    }

    // Rotate to any other view (1 rotation).
    for (let v = 0; v < SNAP_COUNT; v++) {
      if (v === view) continue;
      const next: SolveCost = { rotations: cost.rotations + 1, moves: cost.moves };
      const sid = stateId(node, v);
      if (priority(next) < best[sid]) {
        best[sid] = priority(next);
        queue.push({ node, view: v, cost: next });
      }
    }

    // Tap: walk toward the goal in the current view.
    const outcome = tap[view][node];
    if (outcome && outcome.to !== node) {
      const next: SolveCost = { rotations: cost.rotations, moves: cost.moves + outcome.moves };
      const sid = stateId(outcome.to, view);
      if (priority(next) < best[sid]) {
        best[sid] = priority(next);
        queue.push({ node: outcome.to, view, cost: next });
      }
    }
  }

  return goalCost;
}
