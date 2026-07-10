// Headless tests for the share-link codec and sketch sanitizing.
//
// Run with: npm test

const game = (m) => import(new URL(`../src/game/${m}`, import.meta.url));
const { encodeShare, decodeShare, sanitizeSketch } = await game("storage.ts");
const { EXAMPLES } = await game("examples.ts");
const { validateSketch } = await game("generator.ts");

let fail = 0;
const check = (name, ok) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fail++;
};

// Round trip: every example survives encode -> decode and stays valid.
for (const ex of EXAMPLES) {
  const decoded = decodeShare(encodeShare(ex.sketch, ex.name));
  check(
    `round trip: ${ex.name}`,
    decoded !== null &&
      decoded.name === ex.name &&
      decoded.sketch.nodes.length === ex.sketch.nodes.length &&
      decoded.sketch.edges.length === ex.sketch.edges.length &&
      validateSketch(decoded.sketch) === null &&
      decoded.sketch.nodes.every(
        (n, i) =>
          Math.abs(n.x - ex.sketch.nodes[i].x) < 0.002 &&
          Math.abs(n.y - ex.sketch.nodes[i].y) < 0.002
      )
  );
}

// URL-safe alphabet only.
const code = encodeShare(EXAMPLES[0].sketch);
check("code is URL-safe", /^[A-Za-z0-9_-]+$/.test(code));

// Garbage and tampered payloads are rejected instead of crashing.
check("rejects garbage", decodeShare("not-base64!!") === null);
check("rejects wrong version", decodeShare(btoa(JSON.stringify({ v: 99, n: [] }))) === null);
check(
  "rejects out-of-range edge",
  decodeShare(btoa(JSON.stringify({ v: 1, n: [[0.1, 0.1]], e: [[0, 5]], s: null, g: null }))) ===
    null
);
check(
  "rejects oversized sketch",
  decodeShare(
    btoa(
      JSON.stringify({
        v: 1,
        n: Array.from({ length: 40 }, () => [0.5, 0.5]),
        e: [],
        s: null,
        g: null,
      })
    )
  ) === null
);

// Sanitizer clamps coordinates and deduplicates edges.
const dirty = sanitizeSketch({
  nodes: [
    { id: 0, x: -3, y: 0.5 },
    { id: 1, x: 2, y: 0.5 },
  ],
  edges: [
    [0, 1],
    [1, 0],
  ],
  start: 0,
  goal: 7,
});
check(
  "sanitizer clamps and dedupes",
  dirty !== null &&
    dirty.nodes[0].x >= 0.03 &&
    dirty.nodes[1].x <= 0.97 &&
    dirty.edges.length === 1 &&
    dirty.goal === null
);

console.log(fail === 0 ? "\nALL OK" : `\n${fail} TOTAL FAILURES`);
process.exit(fail === 0 ? 0 : 1);
