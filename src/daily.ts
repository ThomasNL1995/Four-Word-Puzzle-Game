import type { Puzzle } from "./puzzle.ts";

export interface PuzzleSet {
  size: number;
  daily: Puzzle[];
  practice: Puzzle[];
  /** Every real word of this length, for "real words, but not the answer". */
  valid: Set<string>;
}

export type Definition = { pos: string; text: string };

// Each word length has its own data files; they are loaded on first use as separate
// chunks, so players only download the sizes they play.
const puzzleFiles = import.meta.glob<{ default: { daily: Puzzle[]; practice: Puzzle[] } }>("./data/*/puzzles.json");
const validFiles = import.meta.glob<{ default: string[] }>("./data/*/valid-words.json");
const definitionFiles = import.meta.glob<{ default: Record<string, Definition> }>("./data/*/definitions.json");

const sets = new Map<number, Promise<PuzzleSet>>();

export function loadPuzzleSet(size: number): Promise<PuzzleSet> {
  let set = sets.get(size);
  if (!set) {
    set = Promise.all([puzzleFiles[`./data/${size}/puzzles.json`](), validFiles[`./data/${size}/valid-words.json`]()]).then(
      ([puzzles, valid]) => ({
        size,
        daily: puzzles.default.daily,
        practice: puzzles.default.practice,
        valid: new Set(valid.default),
      })
    );
    set.catch(() => sets.delete(size)); // allow a retry, e.g. after being offline
    sets.set(size, set);
  }
  return set;
}

const definitions = new Map<number, Promise<Record<string, Definition>>>();

export function loadDefinitions(size: number): Promise<Record<string, Definition>> {
  let defs = definitions.get(size);
  if (!defs) {
    defs = definitionFiles[`./data/${size}/definitions.json`]().then((m) => m.default);
    defs.catch(() => definitions.delete(size));
    definitions.set(size, defs);
  }
  return defs;
}

/** Puzzle #1 is played on this (local) date. */
const FIRST_DAY = Date.UTC(2026, 9, 6);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily puzzle number for a date, in the player's own time zone. */
export function puzzleNumber(date: Date): number {
  const localMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((localMidnight - FIRST_DAY) / DAY_MS) + 1;
}

/** The (local) date a puzzle number belongs to. */
export function puzzleDate(number: number): Date {
  const utc = new Date(FIRST_DAY + (number - 1) * DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

export function dailyPuzzle(set: PuzzleSet, number: number): Puzzle {
  const list = set.daily;
  const index = (((number - 1) % list.length) + list.length) % list.length;
  return list[index];
}

export function msUntilNextPuzzle(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
