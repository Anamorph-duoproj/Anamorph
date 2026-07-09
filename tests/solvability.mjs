// Headless solvability test: generates all example sketches plus a dense
// 12-node worst case across many seeds, then simulates full playthroughs with
// the real movement policy.
//
// Run with: npm test

const game = (m) => import(new URL(`../src/game/${m}`, import.meta.url));
const { EXAMPLES } = await game("examples.ts");
const { generateLevel } = await game("generator.ts");
const { activeEdgesAtSnap } = await game("anamorph.ts");
const { adjacency, bfsDistances, planWalk } = await game("pathfinding.ts");
const { SNAP_COUNT, MAX_NODES } = await game("types.ts");

function playthrough(lvl) {
  const n = lvl.positions.length;
  const goalDist = bfsDistances(adjacency(n, lvl.edges), lvl.goal);
  let node = lvl.start;
  for (let steps = 0; steps < 100; steps++) {
    if (node === lvl.goal) return true;
    let progressed = false;
    for (let s = 0; s < SNAP_COUNT; s++) {
      const mask = activeEdgesAtSnap(lvl, s);
      const path = planWalk(n, lvl.edges, mask, node, lvl.goal, goalDist);
      if (path && path.length > 1 && goalDist[path[path.length - 1]] < goalDist[node]) {
        node = path[path.length - 1];
        progressed = true;
        break;
      }
    }
    if (!progressed) return false;
  }
  return node === lvl.goal;
}

const dense = {
  nodes: Array.from({ length: MAX_NODES }, (_, id) => ({
    id,
    x: 0.12 + (id % 4) * 0.25,
    y: 0.15 + Math.floor(id / 4) * 0.32,
  })),
  edges: [
    [0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [8, 9], [9, 10], [10, 11],
    [0, 4], [4, 8], [1, 5], [5, 9], [2, 6], [6, 10], [3, 7], [7, 11], [1, 4], [6, 9],
  ],
  start: 0,
  goal: 11,
};

const cases = [
  ...EXAMPLES.map((e) => ({ name: e.name, sketch: e.sketch })),
  { name: "Dense-12", sketch: dense },
];

const SEEDS = 60;
let totalFail = 0;
for (const c of cases) {
  let genFail = 0;
  let playFail = 0;
  for (let i = 1; i <= SEEDS; i++) {
    const res = generateLevel(c.sketch, i * 977 + 3);
    if (!res.ok) {
      genFail++;
      continue;
    }
    if (activeEdgesAtSnap(res.level, 0).some(Boolean) || !playthrough(res.level)) {
      playFail++;
    }
  }
  totalFail += genFail + playFail;
  console.log(
    `${c.name.padEnd(15)} generation failed: ${genFail}/${SEEDS} / playthrough failed: ${playFail}/${SEEDS}`
  );
}

console.log(totalFail === 0 ? "\nALL OK" : `\n${totalFail} TOTAL FAILURES`);
process.exit(totalFail === 0 ? 0 : 1);
