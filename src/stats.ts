// Player stats and saved progress, kept in localStorage, separately per word length.
// Every access is wrapped: storage can be unavailable (private mode, blocked cookies).

import { maxHints, type GameState } from "./state.ts";

export interface Stats {
  /** Daily puzzles started. */
  played: number;
  /** Daily puzzles solved. */
  solved: number;
  currentStreak: number;
  maxStreak: number;
  lastPlayedDay: number | null;
  lastSolvedDay: number | null;
  /** hintDistribution[n] = daily puzzles solved with n hints. */
  hintDistribution: number[];
  bestSeconds: number | null;
  practiceSolved: number;
}

/** One bar per possible hint count; older stats may have a different length or gaps. */
function fitDistribution(counts: number[]): number[] {
  let length = maxHints() + 1;
  counts.forEach((n, i) => {
    if (n > 0) length = Math.max(length, i + 1);
  });
  return Array.from({ length }, (_, i) => counts[i] ?? 0);
}

export function emptyStats(): Stats {
  return {
    played: 0,
    solved: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastPlayedDay: null,
    lastSolvedDay: null,
    hintDistribution: fitDistribution([]),
    bestSeconds: null,
    practiceSolved: 0,
  };
}

export function recordDailyStart(stats: Stats, day: number): Stats {
  if (stats.lastPlayedDay === day) return stats;
  return { ...stats, played: stats.played + 1, lastPlayedDay: day };
}

export function recordDailyWin(stats: Stats, day: number, hints: number, seconds: number): Stats {
  if (stats.lastSolvedDay === day) return stats;
  const currentStreak = stats.lastSolvedDay === day - 1 ? stats.currentStreak + 1 : 1;
  const hintDistribution = [...stats.hintDistribution];
  hintDistribution[hints] = (hintDistribution[hints] ?? 0) + 1;
  hintDistribution.splice(0, Infinity, ...fitDistribution(hintDistribution));
  return {
    ...stats,
    solved: stats.solved + 1,
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    lastSolvedDay: day,
    hintDistribution,
    bestSeconds: stats.bestSeconds === null ? seconds : Math.min(stats.bestSeconds, seconds),
  };
}

/** The streak as it stands today: it is broken once a whole day was skipped. */
export function liveStreak(stats: Stats, today: number): number {
  return stats.lastSolvedDay !== null && stats.lastSolvedDay >= today - 1 ? stats.currentStreak : 0;
}

/** A finished daily puzzle (played on its day or later from the archive). */
export interface DayResult {
  hints: number;
  wrong: number;
  seconds: number;
}

export type Results = Record<number, DayResult>;

export function recordResult(results: Results, day: number, result: DayResult): Results {
  if (results[day]) return results; // the first solve counts
  return { ...results, [day]: result };
}

// ---------- Storage ----------

// 4-letter data keeps the original keys, so existing players keep their stats.
const key = (name: string, size: number) => `word-weaver:${name}${size === 4 ? "" : `:${size}`}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works, it just won't remember.
  }
}

export function loadStats(size: number): Stats {
  const stats: Stats = { ...emptyStats(), ...read<Partial<Stats>>(key("stats", size)) };
  return { ...stats, hintDistribution: fitDistribution(stats.hintDistribution) };
}

export function saveStats(size: number, stats: Stats): void {
  write(key("stats", size), stats);
}

export function loadResults(size: number): Results {
  return read<Results>(key("results", size)) ?? {};
}

export function saveResults(size: number, results: Results): void {
  write(key("results", size), results);
}

/** A game in progress: `id` is the day number (daily, archive) or puzzle index (practice). */
export interface SavedGame {
  id: number;
  state: GameState;
}

export type SaveSlot = "daily" | "archive" | "practice";

interface LegacySaved {
  day?: number;
  index?: number;
  id?: number;
  state: GameState;
}

export function loadGame(slot: SaveSlot, size: number): SavedGame | null {
  const saved = read<LegacySaved>(key(slot, size));
  if (!saved) return null;
  // Older saves used "day" / "index" instead of "id".
  const id = saved.id ?? saved.day ?? saved.index;
  return id === undefined ? null : { id, state: saved.state };
}

export function saveGame(slot: SaveSlot, size: number, saved: SavedGame): void {
  write(key(slot, size), saved);
}

export function loadSetting(name: string): string | null {
  try {
    return localStorage.getItem(`word-weaver:${name}`);
  } catch {
    return null;
  }
}

export function saveSetting(name: string, value: string): void {
  try {
    localStorage.setItem(`word-weaver:${name}`, value);
  } catch {
    // ignore
  }
}
