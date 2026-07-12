// Calibrates every challenge: picks a fixed generator seed and computes the
// optimal solve (par). Easy/Medium aim for a gentle rotation count, Hard and
// Impossible pick the seed that demands the most rotations, so difficulty rises
// across the tiers. Paste the printed block into CALIBRATION in challenges.ts.
//
// Run with: node scripts/calibrate.mjs

const game = (m) => import(new URL(`../src/game/${m}`, import.meta.url));
const { CHALLENGE_BASES } = await game("challenges.ts");
const { generateLevel } = await game("generator.ts");
const { optimalSolve } = await game("solver.ts");

const SEEDS = 300;
// Target rotation count per tier; the picker gets as close as it can, breaking
// ties toward more moves (a more interesting route). Hard/Impossible aim high.
const TARGET = { easy: 2, medium: 4, hard: 99, impossible: 99 };

function pickSeed(base) {
  const target = TARGET[base.difficulty];
  let best = null;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const res = generateLevel(base.sketch, seed);
    if (!res.ok) continue;
    const opt = optimalSolve(res.level);
    if (!opt) continue;
    const distance = Math.abs(opt.rotations - target);
    const score = { distance, moves: opt.moves, seed, opt };
    if (
      best === null ||
      score.distance < best.distance ||
      (score.distance === best.distance && score.moves > best.moves)
    ) {
      best = score;
    }
  }
  return best;
}

const lines = [];
const summary = {};
for (const base of CHALLENGE_BASES) {
  const pick = pickSeed(base);
  if (!pick) {
    console.error(`FAILED to calibrate ${base.id}`);
    process.exit(1);
  }
  lines.push(
    `  "${base.id}": { seed: ${pick.seed}, par: [${pick.opt.rotations}, ${pick.opt.moves}] },`
  );
  (summary[base.difficulty] ??= []).push(pick.opt.rotations);
}

console.log("// paste into CALIBRATION:");
console.log(lines.join("\n"));
console.log("\n// rotation ranges by tier:");
for (const [tier, rots] of Object.entries(summary)) {
  console.log(`//   ${tier.padEnd(11)} ${Math.min(...rots)}-${Math.max(...rots)} rotations`);
}
