// Headless solvability + calibration test.
//
// Challenges use a fixed seed, so each is a deterministic level. We verify:
//  - the level generates and the first 3D view preserves the source sketch,
//  - it is solvable by the real movement policy,
//  - the stored par equals the solver's optimum (guards calibration drift),
//  - the difficulty budget is at least par, and each tier meets a rotation floor.
// Examples keep the broader multi-seed generation/projection sweep.
//
// Run with: npm test

const game = (m) => import(new URL(`../src/game/${m}`, import.meta.url));
const { EXAMPLES } = await game("examples.ts");
const { CHALLENGES, budgetOf } = await game("challenges.ts");
const { generateLevel } = await game("generator.ts");
const { optimalSolve } = await game("solver.ts");
const { activeEdgesAtSnap } = await game("anamorph.ts");
const { adjacency, bfsDistances, planWalk } = await game("pathfinding.ts");
const { SNAP_COUNT, MAX_NODES } = await game("types.ts");
const { projectToView } = await game("view.ts");

let fail = 0;
const check = (cond, msg) => {
  if (!cond) {
    console.log(`FAIL ${msg}`);
    fail++;
  }
};

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

// --- Challenges: deterministic levels with calibrated budgets ---------------
const ROTATION_FLOOR = { easy: 1, medium: 2, hard: 5, impossible: 5 };
const tierRotations = {};
for (const c of CHALLENGES) {
  const res = generateLevel(c.sketch, c.seed);
  if (!res.ok) {
    check(false, `${c.id} generation failed: ${res.reason}`);
    continue;
  }
  const lvl = res.level;
  check(preservesSketch(c.sketch, lvl), `${c.id} first view does not preserve the sketch`);
  check(!activeEdgesAtSnap(lvl, 0).some(Boolean), `${c.id} start view already has active edges`);
  check(playthrough(lvl), `${c.id} is not solvable by the movement policy`);

  const opt = optimalSolve(lvl);
  check(opt !== null, `${c.id} has no optimal solve`);
  if (opt) {
    check(
      opt.rotations === c.par.rotations && opt.moves === c.par.moves,
      `${c.id} par drift: solver ${opt.rotations}/${opt.moves} vs stored ${c.par.rotations}/${c.par.moves}`
    );
    const budget = budgetOf(c);
    check(
      budget.rotations >= opt.rotations && budget.moves >= opt.moves,
      `${c.id} budget below par`
    );
    check(
      opt.rotations >= ROTATION_FLOOR[c.difficulty],
      `${c.id} only ${opt.rotations} rotations, too easy for ${c.difficulty}`
    );
    (tierRotations[c.difficulty] ??= []).push(opt.rotations);
  }
}

// --- Examples: broad multi-seed sweep ---------------------------------------
const SEEDS = 12;
for (const e of EXAMPLES) {
  for (let i = 1; i <= SEEDS; i++) {
    const res = generateLevel(e.sketch, i * 977 + 3);
    check(res.ok, `${e.name} seed ${i} generation failed`);
    if (!res.ok) continue;
    check(preservesSketch(e.sketch, res.level), `${e.name} seed ${i} projection`);
    check(
      !activeEdgesAtSnap(res.level, 0).some(Boolean) && playthrough(res.level),
      `${e.name} seed ${i} playthrough`
    );
  }
}

// --- Dense worst case: the full MAX_NODES grid lattice -----------------------
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
for (let i = 1; i <= SEEDS; i++) {
  const res = generateLevel(dense, i * 977 + 3);
  check(res.ok, `Dense-${MAX_NODES} seed ${i} generation failed`);
  if (res.ok) check(playthrough(res.level), `Dense-${MAX_NODES} seed ${i} playthrough`);
}

for (const [tier, rots] of Object.entries(tierRotations)) {
  console.log(`${tier.padEnd(11)} par rotations ${Math.min(...rots)}-${Math.max(...rots)}`);
}
console.log(fail === 0 ? "\nALL OK" : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
