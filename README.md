# Anamorph

A browser-based perspective puzzle. You draw a small sketch with points and
lines, then Anamorph turns it into a 3D structure. Most viewpoints make the
paths look broken. At specific rotation angles, connected platforms visually
line up and become walkable.

## How to Play

1. **Draw** - Place platforms on the paper. Drag from one platform to another
   to create paths. Mark one platform as the start and one as the goal.
2. **Transform** - Use **Transform to 3D** to generate a playable structure.
   The generator checks that the level can be solved.
3. **Solve** - Drag to rotate the structure. When platforms line up, their
   path becomes active. Tap to move the figure across the currently active
   paths until it reaches the goal.

You can also load one of the example sketches and start from there. On your
first visit, a short interactive tutorial walks you through these steps; it can
be replayed anytime with the **Tutorial** button.

## Editor and Controls

- **Tools**: Draw (place and connect platforms), Move (reposition a platform),
  Start / Goal (mark a platform), Erase (remove a platform or path — hovering
  previews what a click would remove).
- **Undo / Redo**: toolbar buttons or `Ctrl+Z` / `Ctrl+Y` (also `Ctrl+Shift+Z`).
- **In the 3D scene**: drag or use the arrow keys to rotate, tap or press
  `Space` to move the figure.

## Challenge Progress

Layer 3 adds a local challenge track built from the included sketches. Each
challenge has a target move and rotation count, and completed runs save the
best result in `localStorage`. Progress is intentionally local-only for now so
the game remains static and backend-free; shared accounts and stored levels are
left for a later storage layer.

## How the Anamorphosis Works

- **Generator** ([src/game/generator.ts](src/game/generator.ts)): Each spanning
  tree edge receives one of the eight snap angles. The child platform is moved
  in depth along that viewing direction, plus roughly one platform width in the
  image plane. From that exact angle, both platforms appear close enough to
  connect. From the start view, they remain separated.
- **Anamorphosis check** ([src/game/anamorph.ts](src/game/anamorph.ts)): Each
  frame projects the platform endpoints through the orthographic camera. If a
  connected pair lands within the activation tolerance, the edge becomes active.
- **Movement** ([src/game/pathfinding.ts](src/game/pathfinding.ts)): The figure
  uses BFS over the currently active edges. If it cannot reach the goal, it
  moves to the reachable platform that is closest to the goal in the full graph.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
npm test         # solvability checks
```

Stack: React 18, Vite, TypeScript, Tailwind CSS 4, Three.js. No backend.

The core game logic can run headlessly in Node for solvability checks across
example sketches and seeds.

## Deployment

The app builds to static files and does not need a server runtime.

- **Vercel**: Import the repository. Vite is detected automatically
  (build command `npm run build`, output `dist`).
- **Netlify**: [netlify.toml](netlify.toml) is included. Connect the repository
  or run `netlify deploy --prod`.
