// Tiny synthesized sound effects via the Web Audio API. No asset files: every
// sound is a short oscillator envelope, so the bundle stays tiny and there is
// nothing to load. Muteable and remembered across sessions.

const STORAGE_KEY = "anamorph.sound";

let enabled = readEnabled();
let ctx: AudioContext | null = null;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers start the context suspended until a user gesture; resume lazily.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  peak = 0.06,
  delay = 0
): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Soft tick when the structure snaps to a new view. */
export function playSnap(): void {
  tone(300, 0.07, "triangle", 0.04);
}

/** Gentle chime when a connection lines up and becomes walkable. */
export function playActivate(): void {
  tone(660, 0.11, "sine", 0.05);
  tone(990, 0.12, "sine", 0.025, 0.02);
}

/** Quiet footstep as the figure crosses a platform. */
export function playStep(): void {
  tone(196, 0.05, "sine", 0.035);
}

/** Ascending arpeggio on success. */
export function playWin(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.26, "sine", 0.06, i * 0.09));
}

/** Descending buzz when the budget runs out. */
export function playLose(): void {
  [330, 262, 196].forEach((f, i) => tone(f, 0.28, "sawtooth", 0.05, i * 0.08));
}
