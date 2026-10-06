// Pure game logic. Every action takes a state and returns a new state; nothing here
// touches the DOM, so it is easy to test and to save/restore as JSON.

import { CELL_COUNT, CORNERS, EDITABLE, LINE_NAMES, solutionLetters, wordsOnBoard, type LineName, type Puzzle } from "./puzzle.ts";

export const MAX_HINTS = 6;

export type Status = "playing" | "paused" | "won";

export type Feedback =
  | { kind: "incomplete" }
  | { kind: "wrong"; correctLines: LineName[] }
  | { kind: "real-words"; correctLines: LineName[] }
  | { kind: "won" };

export interface GameState {
  puzzle: Puzzle;
  /** Letter on each movable tile, by tile id (0..7). */
  tiles: string[];
  /** Tile id placed in each of the 12 cells. Corners are always null (their letter is fixed). */
  cells: (number | null)[];
  /** Cells filled by a hint. Their tiles are locked. */
  hinted: number[];
  hintsUsed: number;
  wrongSubmits: number;
  /** Time played before the current run. */
  elapsedMs: number;
  /** When the clock was last (re)started, or null while it is stopped. */
  resumedAt: number | null;
  status: Status;
  feedback: Feedback | null;
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function newGame(puzzle: Puzzle, now: number, random: () => number = Math.random): GameState {
  const solution = solutionLetters(puzzle);
  return {
    puzzle,
    tiles: shuffle(
      EDITABLE.map((cell) => solution[cell]),
      random
    ),
    cells: new Array(CELL_COUNT).fill(null),
    hinted: [],
    hintsUsed: 0,
    wrongSubmits: 0,
    elapsedMs: 0,
    resumedAt: now,
    status: "playing",
    feedback: null,
  };
}

// ---------- Queries ----------

export function solution(state: GameState): string[] {
  return solutionLetters(state.puzzle);
}

/** The letter shown in each cell ("" when empty). */
export function boardLetters(state: GameState): string[] {
  const sol = solution(state);
  return state.cells.map((tile, cell) => (CORNERS.includes(cell) ? sol[cell] : tile === null ? "" : state.tiles[tile]));
}

/** Cell index of a tile, or -1 when it is in the tray. */
export function cellOfTile(state: GameState, tile: number): number {
  return state.cells.indexOf(tile);
}

export function isEditable(state: GameState, cell: number): boolean {
  return EDITABLE.includes(cell) && !state.hinted.includes(cell);
}

export function isTileLocked(state: GameState, tile: number): boolean {
  const cell = cellOfTile(state, tile);
  return cell !== -1 && state.hinted.includes(cell);
}

export function elapsedMs(state: GameState, now: number): number {
  return state.elapsedMs + (state.resumedAt === null ? 0 : now - state.resumedAt);
}

export function isSolved(state: GameState): boolean {
  const sol = solution(state);
  return boardLetters(state).every((letter, cell) => letter === sol[cell]);
}

export function hintsLeft(state: GameState): number {
  return MAX_HINTS - state.hintsUsed;
}

// ---------- Actions ----------

/**
 * Moves a tile to a cell, or back to the tray when `toCell` is null.
 * If the target cell is occupied, the tiles swap places (or the occupant returns to the tray
 * when the moved tile came from the tray).
 */
export function moveTile(state: GameState, tile: number, toCell: number | null): GameState {
  if (state.status !== "playing" || isTileLocked(state, tile)) return state;
  if (toCell !== null && !isEditable(state, toCell)) return state;

  const from = cellOfTile(state, tile);
  if (from === toCell || (from === -1 && toCell === null)) return state;

  const cells = [...state.cells];
  if (toCell === null) {
    cells[from] = null;
  } else {
    const occupant = cells[toCell];
    cells[toCell] = tile;
    if (from !== -1) cells[from] = occupant;
  }
  return { ...state, cells, feedback: null };
}

export function clearBoard(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const cells = state.cells.map((tile, cell) => (state.hinted.includes(cell) ? tile : null));
  return { ...state, cells, feedback: null };
}

/**
 * Reveals one letter: a random cell that is not correct yet gets the right tile, locked.
 * Never wastes a hint on a cell the player already has right.
 */
export function useHint(state: GameState, now: number, random: () => number = Math.random): GameState {
  if (state.status !== "playing" || hintsLeft(state) <= 0) return state;

  const sol = solution(state);
  const letters = boardLetters(state);
  const targets = EDITABLE.filter((cell) => !state.hinted.includes(cell) && letters[cell] !== sol[cell]);
  if (targets.length === 0) return state;

  const cell = targets[Math.floor(random() * targets.length)];
  const wanted = sol[cell];
  const candidates = state.tiles.map((letter, tile) => ({ letter, tile })).filter((t) => t.letter === wanted);
  // Prefer a tile from the tray, then one that sits in a wrong spot.
  const tile =
    candidates.find((t) => cellOfTile(state, t.tile) === -1) ??
    candidates.find((t) => {
      const at = cellOfTile(state, t.tile);
      return !state.hinted.includes(at) && letters[at] !== sol[at];
    });
  if (!tile) return state;

  const cells = [...state.cells];
  const from = cells.indexOf(tile.tile);
  if (from !== -1) cells[from] = null;
  cells[cell] = tile.tile; // any occupant goes back to the tray

  const next: GameState = {
    ...state,
    cells,
    hinted: [...state.hinted, cell],
    hintsUsed: state.hintsUsed + 1,
    feedback: null,
  };
  return isSolved(next) ? win(next, now) : next;
}

export function submit(state: GameState, validWords: ReadonlySet<string>, now: number): GameState {
  if (state.status !== "playing") return state;

  const letters = boardLetters(state);
  if (letters.some((letter) => letter === "")) return { ...state, feedback: { kind: "incomplete" } };
  if (isSolved(state)) return win(state, now);

  const words = wordsOnBoard(letters);
  const [top, bottom, left, right] = state.puzzle;
  const answer: Record<LineName, string> = { top, bottom, left, right };
  const correctLines = LINE_NAMES.filter((line) => words[line] === answer[line]);
  const allReal = LINE_NAMES.every((line) => validWords.has(words[line]));
  return {
    ...state,
    wrongSubmits: state.wrongSubmits + 1,
    feedback: { kind: allReal ? "real-words" : "wrong", correctLines },
  };
}

function win(state: GameState, now: number): GameState {
  return { ...state, elapsedMs: elapsedMs(state, now), resumedAt: null, status: "won", feedback: { kind: "won" } };
}

export function pause(state: GameState, now: number): GameState {
  if (state.status !== "playing") return state;
  return { ...state, elapsedMs: elapsedMs(state, now), resumedAt: null, status: "paused" };
}

export function resume(state: GameState, now: number): GameState {
  if (state.status !== "paused") return state;
  return { ...state, resumedAt: now, status: "playing" };
}
