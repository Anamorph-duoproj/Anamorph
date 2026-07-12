// Headless solvability test: generates all challenges, examples, and a dense
// 12-node worst case across several seeds. It verifies playthroughs and checks
// that the first 3D view preserves the source sketch exactly.
//
// Run with: npm test

const game = (m) => import(new URL(`../src/game/${m}`, import.meta.url));
const { EXAMPLES } = await game("examples.ts");
const { CHALLENGES } = await game("challenges.ts");
const { generateLevel } = await game("generator.ts");
const { activeEdgesAtSnap } = await game("anamorph.ts");
const { adjacency, bfsDistances, planWalk } = await game("pathfinding.ts");
const { SNAP_COUNT, MAX_NODES } = await game("types.ts");
const { projectToView } = await game("view.ts");

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

function preservesSketch(sketch, lvl) {
  const projected = lvl.positions.map((position) => projectToView(position, 0));
  const source = sketch.nodes;
  let drawingScale = null;

  for (let i = 1; i < source.length; i++) {
    const dx = source[i].x - source[0].x;
    const dy = source[0].y - source[i].y;
    const du = projected[i].u - projected[0].u;
    const dv = projected[i].v - projected[0].v;
    if (drawingScale === null && Math.abs(dx) > 1e-8) drawingScale = du / dx;
    if (drawingScale === null && Math.abs(dy) > 1e-8) drawingScale = dv / dy;
    if (drawingScale !== null) {
      if (Math.abs(du - dx * drawingScale) > 1e-6) return false;
      if (Math.abs(dv - dy * drawingScale) > 1e-6) return false;
    }
  }
  return drawingScale !== null;
}

// Worst case: the full MAX_NODES as a complete grid lattice.
const COLS = 4;
const ROWS = Math.ceil(MAX_NODES / COLS);
const denseEdges = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const i = row * COLS + col;
    if (col < COLS - 1) denseEdges.push([i, i + 1]);
    if (row < ROWS - 1) denseEdges.push([i, i + COLS]);
  }
}
const dense = {
  nodes: Array.from({ length: MAX_NODES }, (_, id) => ({
    id,
    x: 0.14 + (id % COLS) * 0.24,
    y: 0.1 + Math.floor(id / COLS) * 0.2,
  })),
  edges: denseEdges,
  start: 0,
  goal: MAX_NODES - 1,
};

const cases = [
  ...CHALLENGES.map((c) => ({ name: `${c.difficulty}-${c.title}`, sketch: c.sketch })),
  ...EXAMPLES.map((e) => ({ name: e.name, sketch: e.sketch })),
  { name: `Dense-${MAX_NODES}`, sketch: dense },
];

// Quality gate: the harder groups must not contain accidental shortcuts.
// target.moves is the computed shortest route, so this catches topology bugs.
const MIN_MOVES = { hard: 5, impossible: 6 };
let gateFail = 0;
for (const c of CHALLENGES) {
  const min = MIN_MOVES[c.difficulty];
  if (min && c.target.moves < min) {
    console.log(`GATE ${c.id} "${c.title}": shortest route ${c.target.moves} < ${min}`);
    gateFail++;
  }
}

const SEEDS = 12;
let totalFail = gateFail;
for (const c of cases) {
  let genFail = 0;
  let playFail = 0;
  let projectionFail = 0;
  for (let i = 1; i <= SEEDS; i++) {
    const res = generateLevel(c.sketch, i * 977 + 3);
    if (!res.ok) {
      genFail++;
      continue;
    }
    if (!preservesSketch(c.sketch, res.level)) projectionFail++;
    if (activeEdgesAtSnap(res.level, 0).some(Boolean) || !playthrough(res.level)) {
      playFail++;
    }
  }
  totalFail += genFail + playFail + projectionFail;
  console.log(
    `${c.name.padEnd(29)} generation: ${genFail}/${SEEDS} / play: ${playFail}/${SEEDS} / projection: ${projectionFail}/${SEEDS}`
  );
}

console.log(totalFail === 0 ? "\nALL OK" : `\n${totalFail} TOTAL FAILURES`);
process.exit(totalFail === 0 ? 0 : 1);
