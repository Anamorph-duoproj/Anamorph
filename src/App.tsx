import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import SketchCanvas from "./components/SketchCanvas";
import {
  CHALLENGES,
  CHALLENGE_GROUPS,
  type Challenge,
  type ChallengeDifficulty,
} from "./game/challenges";
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
const TUTORIAL_KEY = "anamorph.tutorialDone.v2";
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
  {
    title: "Place platforms",
    description: "Select Platform and tap the paper at least twice.",
  },
  {
    title: "Connect the route",
    description: "Select Path, then drag from one platform to another.",
  },
  {
    title: "Mark start and goal",
    description: "Choose Start and Goal, then tap one platform for each.",
  },
  {
    title: "Transform your sketch",
    description: "Press Transform to 3D. Your drawing will keep the same shape in the first view.",
  },
  {
    title: "Find the hidden path",
    description: "Rotate the 3D structure until a yellow path appears, then tap the scene to walk.",
  },
];

function tutorialStepFor(sketch: Sketch, phase: Phase): number {
  if (phase === "play") return 4;
  if (phase === "morphing") return 3;
  if (sketch.nodes.length < 2) return 0;
  if (sketch.edges.length < 1) return 1;
  if (sketch.start === null || sketch.goal === null) return 2;
  return 3;
}

function TutorialDiagram({ step }: { step: number }) {
  const is3d = step === 4;
  return (
    <div
      className={`tutorial-diagram relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-black/5 bg-[#faf6ee] ${
        is3d ? "tutorial-diagram-3d" : ""
      }`}
      aria-hidden="true"
    >
      <span className="tutorial-line absolute left-[24px] top-[38px] h-1 w-[40px] origin-left rounded-full bg-[#c7bfe9]" />
      <span className="tutorial-line absolute left-[63px] top-[38px] h-1 w-[40px] origin-left rotate-[-22deg] rounded-full bg-[#c7bfe9]" />
      <span className="tutorial-node absolute left-4 top-7 h-6 w-6 rounded-full border-4 border-white bg-[#7ad3b2] shadow" />
      <span className="tutorial-node absolute left-[54px] top-7 h-6 w-6 rounded-full border-4 border-white bg-[#b9aee8] shadow" />
      <span className="tutorial-node absolute left-[94px] top-[19px] h-6 w-6 rounded-full border-4 border-white bg-[#f7998f] shadow" />
      {step < 4 && (
        <span className="tutorial-pointer absolute bottom-2 left-[42px] h-4 w-4 rotate-[-20deg] rounded-full border-2 border-[#4a4458]/70" />
      )}
    </div>
  );
}

function TutorialPanel({
  step,
  onDismiss,
  compact = false,
}: {
  step: number;
  onDismiss: () => void;
  compact?: boolean;
}) {
  const content = TUTORIAL_STEPS[step];
  return (
    <aside className="animate-fade-up flex w-full items-center gap-4 rounded-lg border border-white/80 bg-white/90 p-4 shadow-lg backdrop-blur">
      {!compact && (
        <div className="hidden sm:block">
          <TutorialDiagram step={step} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase opacity-55">
          <span>Tutorial</span>
          <span>{step + 1}/{TUTORIAL_STEPS.length}</span>
        </div>
        <h2 className="text-lg font-semibold leading-tight">{content.title}</h2>
        <p className="mt-1 text-sm leading-relaxed opacity-75">{content.description}</p>
        <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
          {TUTORIAL_STEPS.map((_, index) => (
            <span
              key={index}
              className="h-1.5 flex-1 rounded-full"
              style={{ backgroundColor: index <= step ? "#8d7bd8" : "rgba(74,68,88,0.13)" }}
            />
          ))}
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium opacity-60 transition hover:bg-white hover:opacity-100"
      >
        {step === TUTORIAL_STEPS.length - 1 ? "Done" : "Skip"}
      </button>
    </aside>
  );
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
  const [signInPassword, setSignInPassword] = useState("");
  const [saveName, setSaveName] = useState("");
  const [levelsVersion, setLevelsVersion] = useState(0);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [activeDifficulty, setActiveDifficulty] = useState<ChallengeDifficulty>("easy");
  const [history, setHistory] = useState<SketchHistory>({
    past: [],
    present: EMPTY_SKETCH,
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

  const handleSignIn = async () => {
    const result = await signIn(signInName, signInPassword);
    if (!result.ok) {
      const message = {
        "invalid-name": "Profile names are 1-24 letters, numbers, spaces, - or _.",
        "invalid-password": "Use a password between 4 and 64 characters.",
        "wrong-password": "That password does not match this profile.",
      }[result.reason];
      notice(message);
      return;
    }
    setUser(result.profile);
    setProgress(loadProgress(result.profile));
    setSignInName("");
    setSignInPassword("");
    setDialog({ kind: "none" });
    notice(
      result.created
        ? `Profile ${result.profile} created and signed in.`
        : `Signed in as ${result.profile}.`
    );
  };

  const handleSignOut = () => {
    signOut();
    setUser(null);
    setProgress({});
    setSignInPassword("");
    notice("Signed out. You are now playing as guest.");
  };

  const handleSaveLevel = () => {
    if (!user) {
      setDialog({ kind: "signin" });
      notice("Sign in before saving a level.");
      return;
    }
    const name = saveName.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) {
      notice("Give the level a name first.");
      return;
    }
    saveLevel(user, name, sketch);
    setLevelsVersion((v) => v + 1);
    setSaveName("");
    setDialog({ kind: "none" });
    notice(`Level "${name}" saved for ${user}.`);
  };

  const handleShare = async () => {
    if (!user) {
      setDialog({ kind: "signin" });
      notice("Sign in before creating a share link.");
      return;
    }
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
  const savedLevels = user ? listLevels(user) : [];
  void levelsVersion; // reading it ties the list above to save/delete updates
  const activeChallenge = CHALLENGES.find((c) => c.id === activeChallengeId) ?? null;
  const completedCount = CHALLENGES.filter((c) => progress[c.id]?.completed).length;
  const visibleChallenges = CHALLENGES.filter((c) => c.difficulty === activeDifficulty);
  const nextChallenge =
    activeChallenge === null
      ? null
      : CHALLENGES[CHALLENGES.findIndex((c) => c.id === activeChallenge.id) + 1] ?? null;

  const selectChallenge = useCallback(
    (challenge: Challenge) => {
      setActiveDifficulty(challenge.difficulty);
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

  const tutorialStep = tutorialStepFor(sketch, phase);

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
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:flex-nowrap sm:px-8">
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
        <div className="flex w-full shrink-0 items-center justify-end gap-2 text-sm sm:w-auto sm:gap-3">
          <span className="hidden rounded-full bg-white/60 px-3 py-1 backdrop-blur sm:inline">
            Progress: {completedCount}/{CHALLENGES.length}
          </span>
          {solved > 0 && (
            <span className="hidden rounded-full bg-white/60 px-3 py-1 backdrop-blur sm:inline">
              Solved: {solved}
            </span>
          )}
          {phase !== "morphing" && (
            <button
              onClick={restartTutorial}
              className="rounded-lg bg-white/70 px-3 py-2 font-medium shadow-sm backdrop-blur transition hover:bg-white sm:px-4"
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
            <span className="flex items-center gap-2 rounded-full bg-white/70 py-1 pl-1 pr-1 shadow-sm backdrop-blur sm:pl-3">
              <span className="hidden max-w-28 truncate font-medium sm:inline">{user}</span>
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
          <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 overflow-y-auto px-4 pb-4 sm:px-6">
            {tutorialActive && (
              <TutorialPanel step={tutorialStep} onDismiss={dismissTutorial} />
            )}
            <section className="animate-fade-up rounded-lg border border-white/70 bg-white/55 p-3 shadow-sm backdrop-blur">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Challenges</h2>
                  <p className="text-xs opacity-60">
                    40 levels across four difficulty categories.
                  </p>
                </div>
                {activeChallenge && (
                  <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-medium">
                    Active: {activeChallenge.title}
                  </span>
                )}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CHALLENGE_GROUPS.map((group) => {
                  const groupChallenges = CHALLENGES.filter((c) => c.difficulty === group.id);
                  const groupDone = groupChallenges.filter((c) => progress[c.id]?.completed).length;
                  const selected = activeDifficulty === group.id;
                  return (
                    <button
                      key={group.id}
                      onClick={() => setActiveDifficulty(group.id)}
                      className={`min-h-14 rounded-lg border px-3 py-2 text-left transition ${
                        selected ? "bg-white shadow-sm" : "border-transparent bg-white/35 hover:bg-white/65"
                      }`}
                      style={selected ? { borderColor: group.color } : undefined}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                        {group.label}
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{ color: group.color, backgroundColor: group.softColor }}
                        >
                          {groupDone}/10
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid auto-cols-[minmax(190px,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1">
                {visibleChallenges.map((challenge, index) => {
                  const entry = progress[challenge.id];
                  const active = activeChallengeId === challenge.id;
                  const group = CHALLENGE_GROUPS.find((item) => item.id === challenge.difficulty)!;
                  return (
                    <button
                      key={challenge.id}
                      onClick={() => selectChallenge(challenge)}
                      className={`min-h-20 rounded-lg border bg-white/65 p-3 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:bg-white ${
                        active ? "ring-2 ring-black/10" : "border-white/60"
                      }`}
                      style={active ? { borderColor: group.color } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{String(index + 1).padStart(2, "0")}. {challenge.title}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{
                            backgroundColor: entry?.completed ? "#dff6ed" : group.softColor,
                            color: entry?.completed ? "#25785e" : group.color,
                          }}
                        >
                          {entry?.completed ? "Done" : group.label}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs opacity-65">
                        {challenge.description}
                      </p>
                      <p className="mt-1 text-xs opacity-70">
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
            <div className="min-h-[420px] flex-1 sm:min-h-[300px]">
              <SketchCanvas
                sketch={sketch}
                onChange={editSketch}
                onNotice={notice}
                onUndo={undo}
                onRedo={redo}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  if (!user) {
                    setDialog({ kind: "signin" });
                    notice("Sign in before saving a level.");
                    return;
                  }
                  setSaveName("");
                  setDialog({ kind: "save" });
                }}
                disabled={sketch.nodes.length === 0}
                className="rounded-lg bg-white/70 px-3 py-2 text-sm font-medium transition hover:bg-white disabled:opacity-40"
              >
                {user ? "Save level" : "Sign in to save"}
              </button>
              <button
                onClick={() => {
                  if (!user) {
                    setDialog({ kind: "signin" });
                    notice("Sign in to open your saved levels.");
                    return;
                  }
                  setDialog({ kind: "levels" });
                }}
                className="rounded-lg bg-white/70 px-3 py-2 text-sm font-medium transition hover:bg-white"
              >
                {user ? `My levels${savedLevels.length > 0 ? ` (${savedLevels.length})` : ""}` : "My levels"}
              </button>
              <button
                onClick={handleShare}
                className="rounded-lg bg-white/70 px-3 py-2 text-sm font-medium transition hover:bg-white"
              >
                {user ? "Share link" : "Sign in to share"}
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

        {phase === "morphing" && (
          <div className="relative h-full">
            <MorphingScreen />
            {tutorialActive && (
              <div className="absolute inset-x-4 top-4 z-10 mx-auto max-w-xl">
                <TutorialPanel step={tutorialStep} onDismiss={dismissTutorial} compact />
              </div>
            )}
          </div>
        )}

        {phase === "play" && level && (
          <>
            <Suspense fallback={<MorphingScreen />}>
              <GameScene key={levelKey} level={level} onWin={completeRun} />
            </Suspense>
            {tutorialActive && !winStats && (
              <div className="absolute left-4 top-16 z-10 w-[min(26rem,calc(100%-2rem))]">
                <TutorialPanel step={tutorialStep} onDismiss={dismissTutorial} />
              </div>
            )}
          </>
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
                      Enter an existing profile or choose a new name to create one. Passwords,
                      levels, and progress stay in this browser.
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
                  <input
                    type="password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                    placeholder="Password (at least 4 characters)"
                    minLength={4}
                    maxLength={64}
                    autoComplete="current-password"
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
                      Saved for {user} in this browser. Saving with an existing name replaces
                      that level.
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
                      My levels - {user}
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
