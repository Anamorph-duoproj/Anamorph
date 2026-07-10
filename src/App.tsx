import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import SketchCanvas from "./components/SketchCanvas";
import { CHALLENGES, type Challenge } from "./game/challenges";
import { EXAMPLES } from "./game/examples";
import { generateLevel, validateSketch } from "./game/generator";
import {
  currentProfile,
  decodeShare,
  deleteLevel,
  encodeShare,
  listLevels,
  listProfiles,
  profileKey,
  saveLevel,
  signIn,
  signOut,
} from "./game/storage";
import type { Level, Sketch, SolveStats } from "./game/types";

// Loaded on demand so Three.js stays out of the initial bundle; the morphing
// screen doubles as the loading state.
const GameScene = lazy(() => import("./components/GameScene"));

type Phase = "draw" | "morphing" | "play";

const EMPTY_SKETCH: Sketch = { nodes: [], edges: [], start: null, goal: null };
const TUTORIAL_KEY = "anamorph.tutorialDone";
const PROGRESS_KEY = "anamorph.challengeProgress.v1";
const HISTORY_LIMIT = 64;

interface SketchHistory {
  past: Sketch[];
  present: Sketch;
  future: Sketch[];
}

interface ChallengeProgressEntry {
  completed: boolean;
  best: SolveStats;
  completedAt: string;
}

type ChallengeProgress = Record<string, ChallengeProgressEntry>;

interface WinState {
  stats: SolveStats;
  challengeId: string | null;
  newBest: boolean;
}

type Dialog =
  | { kind: "none" }
  | { kind: "signin" }
  | { kind: "levels" }
  | { kind: "save" }
  | { kind: "share"; url: string };

const TUTORIAL_STEPS = [
  "Tap the paper to place platforms. You need at least two.",
  "Drag from one platform to another to draw a path.",
  "Select the Start and Goal tools, then tap a platform to mark each.",
  "Press \"Transform to 3D\". Then rotate the structure until paths line up and tap to walk.",
];

function tutorialStepFor(sketch: Sketch): number {
  if (sketch.nodes.length < 2) return 0;
  if (sketch.edges.length < 1) return 1;
  if (sketch.start === null || sketch.goal === null) return 2;
  return 3;
}

function loadProgress(profile: string | null): ChallengeProgress {
  try {
    const raw = localStorage.getItem(profileKey(PROGRESS_KEY, profile));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ChallengeProgress;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isBetterStats(next: SolveStats, best: SolveStats): boolean {
  if (next.moves !== best.moves) return next.moves < best.moves;
  return next.rotations < best.rotations;
}

function MorphingScreen() {
  return (
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
  );
}

export default function App() {
  const firstVisit = useRef(localStorage.getItem(TUTORIAL_KEY) !== "1");
  const [tutorialActive, setTutorialActive] = useState(firstVisit.current);
  const [phase, setPhase] = useState<Phase>("draw");
  const [user, setUser] = useState<string | null>(() => currentProfile());
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [signInName, setSignInName] = useState("");
  const [saveName, setSaveName] = useState("");
  const [levelsVersion, setLevelsVersion] = useState(0);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [history, setHistory] = useState<SketchHistory>({
    past: [],
    // First-time visitors start on a blank sheet so the tutorial can guide
    // them through drawing; returning players get an example preloaded.
    present: firstVisit.current ? EMPTY_SKETCH : EXAMPLES[0].sketch,
    future: [],
  });
  const sketch = history.present;
  const [level, setLevel] = useState<Level | null>(null);
  const [levelKey, setLevelKey] = useState(0);
  const [solved, setSolved] = useState(0);
  const [progress, setProgress] = useState<ChallengeProgress>(() =>
    loadProgress(currentProfile())
  );
  const [winStats, setWinStats] = useState<WinState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);

  const notice = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    localStorage.setItem(profileKey(PROGRESS_KEY, user), JSON.stringify(progress));
  }, [progress, user]);

  const updateSketch = useCallback((next: Sketch) => {
    setHistory((h) => ({
      past: [...h.past, h.present].slice(-HISTORY_LIMIT),
      present: next,
      future: [],
    }));
  }, []);

  const resetSketch = useCallback((next: Sketch) => {
    setHistory({ past: [], present: next, future: [] });
  }, []);

  const editSketch = useCallback(
    (next: Sketch) => {
      setActiveChallengeId(null);
      updateSketch(next);
    },
    [updateSketch]
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      return {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1],
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      return {
        past: [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: h.future[0],
        future: h.future.slice(1),
      };
    });
  }, []);

  // Undo/redo keyboard shortcuts while drawing.
  useEffect(() => {
    if (phase !== "draw") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, undo, redo]);

  // Import a level shared via URL fragment (#level=...), both on initial
  // load and when a share link is opened in an already running tab.
  useEffect(() => {
    const tryImport = () => {
      const match = window.location.hash.match(/^#level=([A-Za-z0-9_-]+)/);
      if (!match) return;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      const decoded = decodeShare(match[1]);
      if (!decoded) {
        notice("This share link is invalid or damaged.");
        return;
      }
      setActiveChallengeId(null);
      resetSketch(decoded.sketch);
      setWinStats(null);
      setLevel(null);
      setPhase("draw");
      notice(decoded.name ? `Shared level "${decoded.name}" loaded.` : "Shared level loaded.");
    };
    tryImport();
    window.addEventListener("hashchange", tryImport);
    return () => window.removeEventListener("hashchange", tryImport);
  }, [notice, resetSketch]);

  const dismissTutorial = useCallback(() => {
    localStorage.setItem(TUTORIAL_KEY, "1");
    setTutorialActive(false);
  }, []);

  const restartTutorial = () => {
    localStorage.removeItem(TUTORIAL_KEY);
    setTutorialActive(true);
  };

  const handleSignIn = () => {
    const resolved = signIn(signInName);
    if (!resolved) {
      notice("Profile names are 1-24 letters, numbers, spaces, - or _.");
      return;
    }
    setUser(resolved);
    setProgress(loadProgress(resolved));
    setSignInName("");
    setDialog({ kind: "none" });
    notice(`Signed in as ${resolved}. Levels and progress are stored in this browser.`);
  };

  const handleSignOut = () => {
    signOut();
    setUser(null);
    setProgress(loadProgress(null));
    notice("Signed out. You are now playing as guest.");
  };

  const handleSaveLevel = () => {
    const name = saveName.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) {
      notice("Give the level a name first.");
      return;
    }
    saveLevel(user, name, sketch);
    setLevelsVersion((v) => v + 1);
    setSaveName("");
    setDialog({ kind: "none" });
    notice(`Level "${name}" saved${user ? ` for ${user}` : ""}.`);
  };

  const handleShare = async () => {
    if (validation) {
      notice(validation);
      return;
    }
    const activeName = savedLevels.find(
      (l) => JSON.stringify(l.sketch) === JSON.stringify(sketch)
    )?.name;
    const url = `${window.location.origin}${window.location.pathname}#level=${encodeShare(
      sketch,
      activeName
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      notice("Share link copied to clipboard.");
    } catch {
      setDialog({ kind: "share", url });
    }
  };

  const validation = validateSketch(sketch);
  const savedLevels = listLevels(user);
  void levelsVersion; // reading it ties the list above to save/delete updates
  const activeChallenge = CHALLENGES.find((c) => c.id === activeChallengeId) ?? null;
  const completedCount = CHALLENGES.filter((c) => progress[c.id]?.completed).length;
  const nextChallenge =
    activeChallenge === null
      ? null
      : CHALLENGES[CHALLENGES.findIndex((c) => c.id === activeChallenge.id) + 1] ?? null;

  const selectChallenge = useCallback(
    (challenge: Challenge) => {
      setActiveChallengeId(challenge.id);
      resetSketch(challenge.sketch);
      setWinStats(null);
      setLevel(null);
      setPhase("draw");
      notice(`${challenge.title} challenge loaded.`);
    },
    [notice, resetSketch]
  );

  const transform = () => {
    if (validation) {
      notice(validation);
      return;
    }
    // Warm the lazy chunk while the morphing screen plays.
    void import("./components/GameScene");
    setPhase("morphing");
    window.setTimeout(() => {
      const result = generateLevel(sketch, Date.now() % 100000);
      if (!result.ok) {
        notice(result.reason);
        setPhase("draw");
        return;
      }
      if (tutorialActive) dismissTutorial();
      setLevel(result.level);
      setLevelKey((k) => k + 1);
      setWinStats(null);
      setPhase("play");
    }, 900);
  };

  const backToDraw = (fresh: boolean) => {
    if (fresh) {
      setActiveChallengeId(null);
      resetSketch(EMPTY_SKETCH);
    }
    setWinStats(null);
    setLevel(null);
    setPhase("draw");
  };

  const replay = () => {
    setWinStats(null);
    setLevelKey((k) => k + 1);
  };

  const tutorialStep = tutorialStepFor(sketch);

  const completeRun = useCallback(
    (stats: SolveStats) => {
      setSolved((s) => s + 1);

      if (!activeChallengeId) {
        setWinStats({ stats, challengeId: null, newBest: false });
        return;
      }

      const previous = progress[activeChallengeId];
      const newBest = !previous || isBetterStats(stats, previous.best);
      setProgress({
        ...progress,
        [activeChallengeId]: {
          completed: true,
          best: newBest ? stats : previous.best,
          completedAt: new Date().toISOString(),
        },
      });
      setWinStats({ stats, challengeId: activeChallengeId, newBest });
    },
    [activeChallengeId, progress]
  );

  const closeDialog = () => setDialog({ kind: "none" });

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
          <span className="hidden rounded-full bg-white/60 px-3 py-1 backdrop-blur sm:inline">
            Progress: {completedCount}/{CHALLENGES.length}
          </span>
          {solved > 0 && (
            <span className="hidden rounded-full bg-white/60 px-3 py-1 backdrop-blur sm:inline">
              Solved: {solved}
            </span>
          )}
          {phase === "draw" && !tutorialActive && (
            <button
              onClick={restartTutorial}
              className="hidden rounded-full bg-white/70 px-4 py-1.5 font-medium shadow-sm backdrop-blur transition hover:bg-white md:inline"
            >
              Tutorial
            </button>
          )}
          {phase === "play" && (
            <button
              onClick={() => backToDraw(false)}
              className="rounded-full bg-white/70 px-4 py-1.5 font-medium shadow-sm backdrop-blur transition hover:bg-white"
            >
              Edit sketch
            </button>
          )}
          {user ? (
            <span className="flex items-center gap-2 rounded-full bg-white/70 py-1 pl-3 pr-1 shadow-sm backdrop-blur">
              <span className="max-w-28 truncate font-medium">{user}</span>
              <button
                onClick={handleSignOut}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium transition hover:shadow"
              >
                Sign out
              </button>
            </span>
          ) : (
            <button
              onClick={() => setDialog({ kind: "signin" })}
              className="rounded-full px-4 py-1.5 font-semibold text-white shadow-sm transition hover:shadow-md"
              style={{ background: "linear-gradient(135deg, #8d7bd8, #5fa8c9)" }}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {phase === "draw" && (
          <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 px-4 pb-4 sm:px-6">
            {tutorialActive && (
              <div className="animate-fade-up flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                  {TUTORIAL_STEPS.map((_, i) => (
                    <span
                      key={i}
                      className="h-2 w-2 rounded-full transition-colors"
                      style={{
                        backgroundColor: i < tutorialStep
                          ? "#7ad3b2"
                          : i === tutorialStep
                            ? "#8d7bd8"
                            : "rgba(74,68,88,0.18)",
                      }}
                    />
                  ))}
                </div>
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">
                    Step {tutorialStep + 1}/{TUTORIAL_STEPS.length}:
                  </span>{" "}
                  {TUTORIAL_STEPS[tutorialStep]}
                </p>
                <button
                  onClick={dismissTutorial}
                  className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium opacity-60 transition hover:bg-white hover:opacity-100"
                >
                  Skip
                </button>
              </div>
            )}
            <section className="animate-fade-up rounded-2xl bg-white/55 p-3 shadow-sm backdrop-blur">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Challenges</h2>
                  <p className="text-xs opacity-60">
                    Complete fixed sketches and improve your best moves and rotations.
                  </p>
                </div>
                {activeChallenge && (
                  <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-medium">
                    Active: {activeChallenge.title}
                  </span>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {CHALLENGES.map((challenge) => {
                  const entry = progress[challenge.id];
                  const active = activeChallengeId === challenge.id;
                  return (
                    <button
                      key={challenge.id}
                      onClick={() => selectChallenge(challenge)}
                      className={`min-h-28 rounded-2xl border bg-white/65 p-3 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:bg-white ${
                        active ? "border-[#8d7bd8] ring-2 ring-[#8d7bd8]/20" : "border-white/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{challenge.title}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{
                            backgroundColor: entry?.completed ? "#dff6ed" : "#f1edf7",
                            color: entry?.completed ? "#25785e" : "#6b5f8f",
                          }}
                        >
                          {entry?.completed ? "Done" : challenge.difficulty}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs opacity-65">
                        {challenge.description}
                      </p>
                      <p className="mt-2 text-xs opacity-70">
                        Target: {challenge.target.moves} moves / {challenge.target.rotations} rotations
                      </p>
                      {entry && (
                        <p className="mt-1 text-xs font-medium">
                          Best: {entry.best.moves} / {entry.best.rotations}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
            <SketchCanvas
              sketch={sketch}
              onChange={editSketch}
              onNotice={notice}
              onUndo={undo}
              onRedo={redo}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm opacity-60">Examples:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.name}
                  title={ex.description}
                  onClick={() => {
                    setActiveChallengeId(null);
                    resetSketch(ex.sketch);
                  }}
                  className="rounded-full bg-white/70 px-3 py-1.5 text-sm transition hover:bg-white"
                >
                  {ex.name}
                </button>
              ))}
              <span className="mx-1 h-6 w-px bg-black/10" aria-hidden="true" />
              <button
                onClick={() => {
                  setSaveName("");
                  setDialog({ kind: "save" });
                }}
                disabled={sketch.nodes.length === 0}
                className="rounded-full bg-white/70 px-3 py-1.5 text-sm font-medium transition hover:bg-white disabled:opacity-40"
              >
                Save level
              </button>
              <button
                onClick={() => setDialog({ kind: "levels" })}
                className="rounded-full bg-white/70 px-3 py-1.5 text-sm font-medium transition hover:bg-white"
              >
                My levels{savedLevels.length > 0 ? ` (${savedLevels.length})` : ""}
              </button>
              <button
                onClick={handleShare}
                className="rounded-full bg-white/70 px-3 py-1.5 text-sm font-medium transition hover:bg-white"
              >
                Share link
              </button>
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

        {phase === "morphing" && <MorphingScreen />}

        {phase === "play" && level && (
          <Suspense fallback={<MorphingScreen />}>
            <GameScene key={levelKey} level={level} onWin={completeRun} />
          </Suspense>
        )}

        {winStats && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 backdrop-blur-sm">
            <div className="animate-pop-in mx-4 flex max-w-sm flex-col items-center gap-4 rounded-3xl bg-white/90 px-8 py-8 text-center shadow-2xl">
              <img src="/assets/icon.webp" alt="" className="h-20 w-20 rounded-xl object-cover shadow" />
              <h2 className="text-2xl font-semibold" style={{ fontFamily: "Georgia, serif" }}>
                {winStats.challengeId ? "Challenge complete" : "Solved"}
              </h2>
              <p className="text-sm opacity-70">
                {winStats.stats.moves} {winStats.stats.moves === 1 ? "move" : "moves"} /{" "}
                {winStats.stats.rotations}{" "}
                {winStats.stats.rotations === 1 ? "rotation" : "rotations"}
              </p>
              {winStats.challengeId && (
                <p className="rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm">
                  {winStats.newBest ? "New best saved" : "Progress saved"}
                  {user ? ` for ${user}` : ""}
                </p>
              )}
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
                {nextChallenge && winStats.challengeId && (
                  <button
                    onClick={() => selectChallenge(nextChallenge)}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow transition hover:scale-105"
                  >
                    Next challenge
                  </button>
                )}
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

        {dialog.kind !== "none" && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            onClick={closeDialog}
          >
            <div
              className="animate-pop-in mx-4 flex w-full max-w-md flex-col gap-4 rounded-3xl bg-white/95 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {dialog.kind === "signin" && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">Sign in</h2>
                    <p className="mt-1 text-xs opacity-60">
                      Local profile without a password. Your levels and challenge progress
                      are stored only in this browser.
                    </p>
                  </div>
                  <input
                    autoFocus
                    value={signInName}
                    onChange={(e) => setSignInName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                    placeholder="Profile name"
                    maxLength={24}
                    className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#8d7bd8]"
                  />
                  {listProfiles().length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs opacity-60">Existing:</span>
                      {listProfiles().map((p) => (
                        <button
                          key={p}
                          onClick={() => setSignInName(p)}
                          className="rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm transition hover:shadow"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={closeDialog}
                      className="rounded-full px-4 py-2 text-sm font-medium opacity-70 transition hover:opacity-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSignIn}
                      className="rounded-full px-5 py-2 text-sm font-semibold text-white shadow transition hover:shadow-md"
                      style={{ background: "linear-gradient(135deg, #8d7bd8, #5fa8c9)" }}
                    >
                      Sign in
                    </button>
                  </div>
                </>
              )}

              {dialog.kind === "save" && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">Save level</h2>
                    <p className="mt-1 text-xs opacity-60">
                      Saved {user ? `for ${user}` : "as guest"} in this browser. Saving with
                      an existing name replaces that level.
                    </p>
                  </div>
                  <input
                    autoFocus
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveLevel()}
                    placeholder="Level name"
                    maxLength={40}
                    className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#8d7bd8]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={closeDialog}
                      className="rounded-full px-4 py-2 text-sm font-medium opacity-70 transition hover:opacity-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveLevel}
                      className="rounded-full px-5 py-2 text-sm font-semibold text-white shadow transition hover:shadow-md"
                      style={{ background: "linear-gradient(135deg, #8d7bd8, #5fa8c9)" }}
                    >
                      Save
                    </button>
                  </div>
                </>
              )}

              {dialog.kind === "levels" && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">
                      My levels {user ? `- ${user}` : "- guest"}
                    </h2>
                    <p className="mt-1 text-xs opacity-60">
                      {savedLevels.length === 0
                        ? "Nothing saved yet. Draw a sketch and use Save level."
                        : "Load a level into the editor or delete it."}
                    </p>
                  </div>
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                    {savedLevels.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center gap-3 rounded-xl bg-white px-4 py-2.5 shadow-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <p className="text-xs opacity-55">
                            {l.sketch.nodes.length} platforms /{" "}
                            {new Date(l.savedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setActiveChallengeId(null);
                            resetSketch(l.sketch);
                            closeDialog();
                            notice(`Level "${l.name}" loaded.`);
                          }}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:shadow"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => {
                            deleteLevel(user, l.id);
                            setLevelsVersion((v) => v + 1);
                          }}
                          className="rounded-full px-2 py-1.5 text-xs font-medium text-red-400 transition hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={closeDialog}
                      className="rounded-full px-4 py-2 text-sm font-medium opacity-70 transition hover:opacity-100"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}

              {dialog.kind === "share" && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">Share link</h2>
                    <p className="mt-1 text-xs opacity-60">
                      Copying to the clipboard was blocked. Copy the link manually:
                    </p>
                  </div>
                  <input
                    readOnly
                    value={dialog.url}
                    onFocus={(e) => e.target.select()}
                    className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-xs outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={closeDialog}
                      className="rounded-full px-4 py-2 text-sm font-medium opacity-70 transition hover:opacity-100"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
            <div className="animate-pop-in rounded-xl bg-white/90 px-5 py-2.5 text-sm shadow-lg backdrop-blur">
              {toast}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
