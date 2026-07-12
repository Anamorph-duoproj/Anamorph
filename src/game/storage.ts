import { MAX_NODES, type Sketch } from "./types.ts";

// Local, per-browser persistence. There is no backend: signing in unlocks a
// named profile whose password hash, saved levels, and progress live in
// localStorage under a per-profile namespace.

const PROFILES_KEY = "anamorph.profiles";
const PROFILE_AUTH_KEY = "anamorph.profileAuth.v1";
const CURRENT_PROFILE_KEY = "anamorph.currentProfile";
const LEVELS_BASE = "anamorph.savedLevels.v1";
const SHARE_VERSION = 1;

export type SignInResult =
  | { ok: true; profile: string; created: boolean }
  | { ok: false; reason: "invalid-name" | "invalid-password" | "wrong-password" };

export interface SavedLevel {
  id: string;
  name: string;
  sketch: Sketch;
  savedAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// --- Profiles ---------------------------------------------------------------

interface ProfileAuth {
  name: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export function listProfiles(): string[] {
  const list = readJson<unknown>(PROFILES_KEY, []);
  return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : [];
}

export function currentProfile(): string | null {
  return localStorage.getItem(CURRENT_PROFILE_KEY);
}

export function normalizeProfileName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 24) return null;
  if (!/^[\p{L}\p{N} _-]+$/u.test(name)) return null;
  return name;
}

export async function signIn(rawName: string, rawPassword: string): Promise<SignInResult> {
  const name = normalizeProfileName(rawName);
  if (!name) return { ok: false, reason: "invalid-name" };
  const password = rawPassword;
  if (password.length < 4 || password.length > 64)
    return { ok: false, reason: "invalid-password" };

  const profiles = listProfiles();
  const existing = profiles.find((p) => p.toLowerCase() === name.toLowerCase());
  const resolved = existing ?? name;
  const auth = readAuth();
  const key = authKey(resolved);
  const existingAuth = auth[key];

  if (existingAuth) {
    if (existingAuth.passwordHash !== await hashPassword(resolved, password, existingAuth.salt)) {
      return { ok: false, reason: "wrong-password" };
    }
    localStorage.setItem(CURRENT_PROFILE_KEY, existingAuth.name);
    return { ok: true, profile: existingAuth.name, created: false };
  }

  const salt = newId();
  auth[key] = {
    name: resolved,
    salt,
    passwordHash: await hashPassword(resolved, password, salt),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(PROFILE_AUTH_KEY, JSON.stringify(auth));
  if (!existing) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify([...profiles, resolved]));
  }
  localStorage.setItem(CURRENT_PROFILE_KEY, resolved);
  return { ok: true, profile: resolved, created: true };
}

export function signOut(): void {
  localStorage.removeItem(CURRENT_PROFILE_KEY);
}

/** Namespace a storage key by profile; guests use the bare key. */
export function profileKey(base: string, profile: string | null): string {
  return profile ? `${base}.u.${profile.toLowerCase()}` : base;
}

function readAuth(): Record<string, ProfileAuth> {
  const raw = readJson<unknown>(PROFILE_AUTH_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw).filter(
    (entry): entry is [string, ProfileAuth] =>
      !!entry[1] &&
      typeof entry[1] === "object" &&
      typeof (entry[1] as ProfileAuth).name === "string" &&
      typeof (entry[1] as ProfileAuth).salt === "string" &&
      typeof (entry[1] as ProfileAuth).passwordHash === "string"
  );
  return Object.fromEntries(entries);
}

function authKey(profile: string): string {
  return profile.toLowerCase();
}

async function hashPassword(profile: string, password: string, salt: string): Promise<string> {
  const text = `${authKey(profile)}:${salt}:${password}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// --- Saved levels -----------------------------------------------------------

export function listLevels(profile: string | null): SavedLevel[] {
  const list = readJson<unknown>(profileKey(LEVELS_BASE, profile), []);
  if (!Array.isArray(list)) return [];
  return list.filter(
    (l): l is SavedLevel =>
      !!l &&
      typeof l === "object" &&
      typeof (l as SavedLevel).id === "string" &&
      typeof (l as SavedLevel).name === "string" &&
      sanitizeSketch((l as SavedLevel).sketch) !== null
  );
}

function writeLevels(profile: string | null, levels: SavedLevel[]): void {
  localStorage.setItem(profileKey(LEVELS_BASE, profile), JSON.stringify(levels));
}

/** Saves under the given name; an existing level with the same name is replaced. */
export function saveLevel(profile: string | null, name: string, sketch: Sketch): SavedLevel {
  const levels = listLevels(profile);
  const existing = levels.find((l) => l.name.toLowerCase() === name.toLowerCase());
  const entry: SavedLevel = {
    id: existing?.id ?? newId(),
    name,
    sketch,
    savedAt: new Date().toISOString(),
  };
  writeLevels(profile, [entry, ...levels.filter((l) => l.id !== entry.id)]);
  return entry;
}

export function deleteLevel(profile: string | null, id: string): void {
  writeLevels(
    profile,
    listLevels(profile).filter((l) => l.id !== id)
  );
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- Share links ------------------------------------------------------------
// The whole sketch is encoded into the URL fragment, so shared levels need no
// server. Coordinates are rounded to three decimals to keep links short.

interface SharePayload {
  v: number;
  name?: string;
  n: [number, number][];
  e: [number, number][];
  s: number | null;
  g: number | null;
}

export function encodeShare(sketch: Sketch, name?: string): string {
  const index = new Map(sketch.nodes.map((node, i) => [node.id, i]));
  const payload: SharePayload = {
    v: SHARE_VERSION,
    ...(name ? { name } : {}),
    n: sketch.nodes.map((node) => [round3(node.x), round3(node.y)]),
    e: sketch.edges.map(([a, b]) => [index.get(a)!, index.get(b)!]),
    s: sketch.start === null ? null : index.get(sketch.start)!,
    g: sketch.goal === null ? null : index.get(sketch.goal)!,
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShare(code: string): { sketch: Sketch; name?: string } | null {
  let payload: SharePayload;
  try {
    payload = JSON.parse(fromBase64Url(code)) as SharePayload;
  } catch {
    return null;
  }
  if (!payload || payload.v !== SHARE_VERSION || !Array.isArray(payload.n)) return null;

  const sketch = sanitizeSketch({
    nodes: payload.n.map((pair, id) => ({
      id,
      x: Array.isArray(pair) ? Number(pair[0]) : NaN,
      y: Array.isArray(pair) ? Number(pair[1]) : NaN,
    })),
    edges: Array.isArray(payload.e) ? (payload.e as [number, number][]) : [],
    start: typeof payload.s === "number" ? payload.s : null,
    goal: typeof payload.g === "number" ? payload.g : null,
  });
  if (!sketch) return null;
  const name = typeof payload.name === "string" ? payload.name.slice(0, 40) : undefined;
  return { sketch, ...(name ? { name } : {}) };
}

/** Validates and normalizes untrusted sketch data; returns null if unusable. */
export function sanitizeSketch(raw: Sketch | undefined): Sketch | null {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  if (raw.nodes.length > MAX_NODES) return null;

  const nodes = [];
  for (const node of raw.nodes) {
    const x = Number(node?.x);
    const y = Number(node?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    nodes.push({
      id: nodes.length,
      x: Math.min(0.97, Math.max(0.03, x)),
      y: Math.min(0.97, Math.max(0.03, y)),
    });
  }

  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const edge of raw.edges) {
    if (!Array.isArray(edge)) return null;
    const a = Number(edge[0]);
    const b = Number(edge[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    if (a < 0 || b < 0 || a >= nodes.length || b >= nodes.length || a === b) return null;
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b]);
  }

  const valid = (i: number | null) =>
    typeof i === "number" && Number.isInteger(i) && i >= 0 && i < nodes.length ? i : null;

  return { nodes, edges, start: valid(raw.start), goal: valid(raw.goal) };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function toBase64Url(text: string): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
