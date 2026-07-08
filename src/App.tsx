import { useCallback, useEffect, useRef, useState } from "react";
import SketchCanvas from "./components/SketchCanvas";
import GameScene from "./components/GameScene";
import { EXAMPLES } from "./game/examples";
import { generateLevel, validateSketch } from "./game/generator";
import type { Level, Sketch } from "./game/types";

type Phase = "draw" | "morphing" | "play";

const EMPTY_SKETCH: Sketch = { nodes: [], edges: [], start: null, goal: null };

export default function App() {
  const [phase, setPhase] = useState<Phase>("draw");
  const [sketch, setSketch] = useState<Sketch>(EXAMPLES[0].sketch);
  const [level, setLevel] = useState<Level | null>(null);
  const [levelKey, setLevelKey] = useState(0);
  const [solved, setSolved] = useState(0);
  const [winStats, setWinStats] = useState<{ moves: number; rotations: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);

  const notice = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const validation = validateSketch(sketch);

  const transform = () => {
    if (validation) {
      notice(validation);
      return;
    }
    setPhase("morphing");
    window.setTimeout(() => {
      const result = generateLevel(sketch, Date.now() % 100000);
      if (!result.ok) {
        notice(result.reason);
        setPhase("draw");
        return;
      }
      setLevel(result.level);
      setLevelKey((k) => k + 1);
      setWinStats(null);
      setPhase("play");
    }, 900);
  };

  const backToDraw = (fresh: boolean) => {
    if (fresh) setSketch(EMPTY_SKETCH);
    setWinStats(null);
    setLevel(null);
    setPhase("draw");
  };

  const replay = () => {
    setWinStats(null);
    setLevelKey((k) => k + 1);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/assets/icon.webp"
            alt=""
            className="brand-mark h-11 w-11 shrink-0 rounded-lg object-cover sm:h-12 sm:w-12"
          />
          <img
            src="/assets/wordmark-header.png"
            alt="Anamorph"
            className="brand-wordmark min-w-0 object-contain"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          {solved > 0 && (
            <span className="rounded-full bg-white/60 px-3 py-1 backdrop-blur">
              Solved: {solved}
            </span>
          )}
          {phase === "play" && (
            <button
              onClick={() => backToDraw(false)}
              className="rounded-full bg-white/70 px-4 py-1.5 font-medium shadow-sm backdrop-blur transition hover:bg-white"
            >
              Edit sketch
            </button>
          )}
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {phase === "draw" && (
          <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 px-4 pb-4 sm:px-6">
            <SketchCanvas sketch={sketch} onChange={setSketch} onNotice={notice} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm opacity-60">Examples:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.name}
                  title={ex.description}
                  onClick={() => setSketch(ex.sketch)}
                  className="rounded-full bg-white/70 px-3 py-1.5 text-sm transition hover:bg-white"
                >
                  {ex.name}
                </button>
              ))}
              <button
                onClick={transform}
                className={`ml-auto rounded-full px-6 py-2.5 text-base font-semibold text-white shadow-lg transition-all ${
                  validation
                    ? "cursor-not-allowed bg-gray-400/70"
                    : "hover:scale-105 hover:shadow-xl"
                }`}
                style={
                  validation
                    ? {}
                    : { background: "linear-gradient(135deg, #8d7bd8, #5fa8c9)" }
                }
              >
                Transform to 3D
              </button>
            </div>
            {validation && sketch.nodes.length > 0 && (
              <p className="text-center text-sm opacity-60">{validation}</p>
            )}
          </div>
        )}

        {phase === "morphing" && (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <img
              src="/assets/icon.webp"
              alt=""
              className="animate-float-soft h-20 w-20 rounded-xl object-cover shadow-xl"
            />
            <p className="animate-fade-up text-lg" style={{ fontFamily: "Georgia, serif" }}>
              Building your world...
            </p>
          </div>
        )}

        {phase === "play" && level && (
          <GameScene
            key={levelKey}
            level={level}
            onWin={(stats) => {
              setSolved((s) => s + 1);
              setWinStats(stats);
            }}
          />
        )}

        {winStats && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 backdrop-blur-sm">
            <div className="animate-pop-in mx-4 flex max-w-sm flex-col items-center gap-4 rounded-3xl bg-white/90 px-8 py-8 text-center shadow-2xl">
              <img src="/assets/icon.webp" alt="" className="h-20 w-20 rounded-xl object-cover shadow" />
              <h2 className="text-2xl font-semibold" style={{ fontFamily: "Georgia, serif" }}>
                Solved
              </h2>
              <p className="text-sm opacity-70">
                {winStats.moves} {winStats.moves === 1 ? "move" : "moves"} /{" "}
                {winStats.rotations} {winStats.rotations === 1 ? "rotation" : "rotations"}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={replay}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow transition hover:scale-105"
                >
                  Play again
                </button>
                <button
                  onClick={() => backToDraw(false)}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow transition hover:scale-105"
                >
                  Edit sketch
                </button>
                <button
                  onClick={() => backToDraw(true)}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow transition hover:scale-105"
                  style={{ background: "linear-gradient(135deg, #8d7bd8, #5fa8c9)" }}
                >
                  New sketch
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
            <div className="animate-pop-in rounded-xl bg-white/90 px-5 py-2.5 text-sm shadow-lg backdrop-blur">
              {toast}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
