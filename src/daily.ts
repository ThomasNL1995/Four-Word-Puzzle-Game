import type { Puzzle } from "./puzzle.ts";
import puzzles from "./data/puzzles.json";

export const dailyPuzzles = puzzles.daily as Puzzle[];
export const practicePuzzles = puzzles.practice as Puzzle[];

/** Puzzle #1 is played on this (local) date. */
const FIRST_DAY = Date.UTC(2026, 9, 6);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily puzzle number for a date, in the player's own time zone. */
export function puzzleNumber(date: Date): number {
  const localMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((localMidnight - FIRST_DAY) / DAY_MS) + 1;
}

export function dailyPuzzle(number: number): Puzzle {
  const index = (((number - 1) % dailyPuzzles.length) + dailyPuzzles.length) % dailyPuzzles.length;
  return dailyPuzzles[index];
}

export function msUntilNextPuzzle(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
