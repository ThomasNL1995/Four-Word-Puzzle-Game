// Player stats and saved progress, kept in localStorage.
// Every access is wrapped: storage can be unavailable (private mode, blocked cookies).

import { MAX_HINTS, type GameState } from "./state.ts";

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

export function emptyStats(): Stats {
  return {
    played: 0,
    solved: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastPlayedDay: null,
    lastSolvedDay: null,
    hintDistribution: new Array(MAX_HINTS + 1).fill(0),
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

// ---------- Storage ----------

const STATS_KEY = "word-weaver:stats";
const DAILY_KEY = "word-weaver:daily";
const PRACTICE_KEY = "word-weaver:practice";

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

export function loadStats(): Stats {
  return { ...emptyStats(), ...read<Partial<Stats>>(STATS_KEY) };
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, stats);
}

export interface SavedDaily {
  day: number;
  state: GameState;
}

export interface SavedPractice {
  index: number;
  state: GameState;
}

export function loadDaily(): SavedDaily | null {
  return read<SavedDaily>(DAILY_KEY);
}

export function saveDaily(saved: SavedDaily): void {
  write(DAILY_KEY, saved);
}

export function loadPractice(): SavedPractice | null {
  return read<SavedPractice>(PRACTICE_KEY);
}

export function savePractice(saved: SavedPractice): void {
  write(PRACTICE_KEY, saved);
}
