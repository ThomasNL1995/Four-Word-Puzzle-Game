// Pure game logic. Every action takes a state and returns a new state; nothing here
// touches the DOM, so it is easy to test and to save/restore as JSON.

import { layout, LINE_NAMES, solutionLetters, wordsOnBoard, type Layout, type LineName, type Puzzle } from "./puzzle.ts";

/**
 * Two kinds of hints, four of each on every board: a clue (what a word means) and a letter
 * (the 3rd letter of a word). Each one counts as a hint in the score.
 */
export const CLUE_HINTS = 4;
export const LETTER_HINTS = 4;

export function maxHints(): number {
  return CLUE_HINTS + LETTER_HINTS;
}

export type Status = "playing" | "paused" | "won";

export type Feedback =
  | { kind: "incomplete" }
  | { kind: "wrong" }
  | { kind: "real-words" }
  | { kind: "won" };

export interface GameState {
  puzzle: Puzzle;
  /** Letter on each movable tile, by tile id (0..7). */
  tiles: string[];
  /** Tile id placed in each of the 12 cells. Corners are always null (their letter is fixed). */
  cells: (number | null)[];
  /** Cells filled by a hint. Their tiles are locked. */
  hinted: number[];
  /** Words whose clue was revealed (clue hints). Optional: older saves don't have it. */
  clues?: LineName[];
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
      layout(puzzle[0].length).editable.map((cell) => solution[cell]),
      random
    ),
    cells: new Array(layout(puzzle[0].length).cellCount).fill(null),
    hinted: [],
    clues: [],
    hintsUsed: 0,
    wrongSubmits: 0,
    elapsedMs: 0,
    resumedAt: now,
    status: "playing",
    feedback: null,
  };
}

// ---------- Queries ----------

export function size(state: GameState): number {
  return state.puzzle[0].length;
}

export function boardLayout(state: GameState): Layout {
  return layout(size(state));
}

export function solution(state: GameState): string[] {
  return solutionLetters(state.puzzle);
}

/** The letter shown in each cell ("" when empty). */
export function boardLetters(state: GameState): string[] {
  const sol = solution(state);
  const { corners } = boardLayout(state);
  return state.cells.map((tile, cell) => (corners.includes(cell) ? sol[cell] : tile === null ? "" : state.tiles[tile]));
}

/** Cell index of a tile, or -1 when it is in the tray. */
export function cellOfTile(state: GameState, tile: number): number {
  return state.cells.indexOf(tile);
}

export function isEditable(state: GameState, cell: number): boolean {
  return boardLayout(state).editable.includes(cell) && !state.hinted.includes(cell);
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

/** Words whose 3rd letter can still be revealed. */
export function lettersLeft(state: GameState): LineName[] {
  const { lines } = boardLayout(state);
  return LINE_NAMES.filter((line) => !state.hinted.includes(lines[line][2]));
}

/** Words whose clue can still be revealed. */
export function cluesLeft(state: GameState): LineName[] {
  return LINE_NAMES.filter((line) => !(state.clues ?? []).includes(line));
}

function isFull(state: GameState): boolean {
  return boardLetters(state).every((letter) => letter !== "");
}

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

/** The preferred word if it is still available, otherwise the first available one. */
function pick(available: LineName[], preferred: LineName | null): LineName | undefined {
  return preferred && available.includes(preferred) ? preferred : available[0];
}

/**
 * Reveals the 3rd letter of a word (the preferred one if it can, otherwise the next in board
 * order): the right tile goes there and is locked. If the player already had it right, it is
 * locked too; the hint confirms it.
 */
export function useLetterHint(state: GameState, preferred: LineName | null, now: number): GameState {
  if (state.status !== "playing") return state;
  const line = pick(lettersLeft(state), preferred);
  if (!line) return state;
  const cell = boardLayout(state).lines[line][2];

  const sol = solution(state);
  const letters = boardLetters(state);
  const cells = [...state.cells];
  if (letters[cell] !== sol[cell]) {
    const candidates = state.tiles.map((letter, tile) => ({ letter, tile })).filter((t) => t.letter === sol[cell]);
    // Prefer a tile from the tray, then one that sits in a wrong spot.
    const tile =
      candidates.find((t) => cellOfTile(state, t.tile) === -1) ??
      candidates.find((t) => {
        const at = cellOfTile(state, t.tile);
        return !state.hinted.includes(at) && letters[at] !== sol[at];
      });
    if (!tile) return state;
    const from = cells.indexOf(tile.tile);
    if (from !== -1) cells[from] = null;
    cells[cell] = tile.tile; // any occupant goes back to the tray
  }

  const next: GameState = {
    ...state,
    cells,
    hinted: [...state.hinted, cell],
    hintsUsed: state.hintsUsed + 1,
    feedback: null,
  };
  return isSolved(next) ? win(next, now) : next;
}

/** Reveals the clue of a word: the preferred one if it has none yet, otherwise the next without. */
export function useClue(state: GameState, preferred: LineName | null): GameState {
  if (state.status !== "playing") return state;
  const line = pick(cluesLeft(state), preferred);
  if (!line) return state;
  return { ...state, clues: [...(state.clues ?? []), line], hintsUsed: state.hintsUsed + 1, feedback: null };
}

export function submit(state: GameState, validWords: ReadonlySet<string>, now: number): GameState {
  if (state.status !== "playing") return state;

  if (!isFull(state)) return { ...state, feedback: { kind: "incomplete" } };
  if (isSolved(state)) return win(state, now);

  // On purpose no word-by-word feedback: a wrong board only says it's wrong.
  const words = wordsOnBoard(boardLetters(state), size(state));
  const allReal = LINE_NAMES.every((line) => validWords.has(words[line]));
  return { ...state, wrongSubmits: state.wrongSubmits + 1, feedback: { kind: allReal ? "real-words" : "wrong" } };
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
