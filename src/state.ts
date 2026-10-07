// Pure game logic. Every action takes a state and returns a new state; nothing here
// touches the DOM, so it is easy to test and to save/restore as JSON.

import { layout, LINE_NAMES, solutionLetters, wordsOnBoard, type Layout, type LineName, type Puzzle } from "./puzzle.ts";

/** Hints per board: three per side, so at least a quarter of the letters are yours. */
export function maxHints(size: number): number {
  return (size - 2) * 3;
}

export type Status = "playing" | "paused" | "won";

/**
 * Hint types (temporary, to try out which one feels best):
 * - letter: reveal a random letter
 * - useful: reveal the next letter of the word with the most possible answers
 * - clue: show the definition of one word
 * - check: mark which complete words are right (there is no submit: a full, right board wins)
 */
export type HintType = "letter" | "useful" | "clue" | "check";
export const HINT_TYPES: HintType[] = ["letter", "useful", "clue", "check"];

export type Feedback =
  | { kind: "incomplete" }
  | { kind: "wrong" }
  | { kind: "real-words" }
  | { kind: "full" }
  | { kind: "checked"; right: number; complete: number }
  | { kind: "nothing-to-check" }
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
  /** Words a check marked as right; a word loses its mark when it changes. */
  checked?: LineName[];
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
    checked: [],
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

export function hintsLeft(state: GameState): number {
  return maxHints(size(state)) - state.hintsUsed;
}

function isLineRight(state: GameState, line: LineName): boolean {
  const sol = solution(state);
  const letters = boardLetters(state);
  return boardLayout(state).lines[line].every((cell) => letters[cell] === sol[cell]);
}

function isFull(state: GameState): boolean {
  return boardLetters(state).every((letter) => letter !== "");
}

/** After the board changed: words marked right by a check keep their mark only while they stay right. */
function withCells(state: GameState, cells: (number | null)[]): GameState {
  const next = { ...state, cells, feedback: null };
  return { ...next, checked: (state.checked ?? []).filter((line) => isLineRight(next, line)) };
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
  return withCells(state, cells);
}

export function clearBoard(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const cells = state.cells.map((tile, cell) => (state.hinted.includes(cell) ? tile : null));
  return withCells(state, cells);
}

/** Cells a letter hint may reveal: not hinted yet and not already right. */
function hintTargets(state: GameState): number[] {
  const sol = solution(state);
  const letters = boardLetters(state);
  return boardLayout(state).editable.filter((cell) => !state.hinted.includes(cell) && letters[cell] !== sol[cell]);
}

/**
 * Reveals one letter: a random cell that is not correct yet gets the right tile, locked.
 * Never wastes a hint on a cell the player already has right.
 */
export function useHint(state: GameState, now: number, random: () => number = Math.random): GameState {
  if (state.status !== "playing" || hintsLeft(state) <= 0) return state;
  const targets = hintTargets(state);
  if (targets.length === 0) return state;
  return revealCell(state, targets[Math.floor(random() * targets.length)], now);
}

/**
 * Possible answers for a line, from what the player knows for sure: the corners, the hinted
 * letters and the letters that are not locked yet.
 */
export function lineCandidates(state: GameState, line: LineName, words: Iterable<string>): string[] {
  const sol = solution(state);
  const cells = boardLayout(state).lines[line];
  const known = cells.map((cell) => (boardLayout(state).corners.includes(cell) || state.hinted.includes(cell) ? sol[cell] : null));
  const free = new Map<string, number>();
  state.tiles.forEach((letter, tile) => {
    if (!isTileLocked(state, tile)) free.set(letter, (free.get(letter) ?? 0) + 1);
  });
  const result: string[] = [];
  for (const word of words) {
    if (word.length !== cells.length) continue;
    const left = new Map(free);
    const fits = [...word].every((letter, i) => {
      if (known[i] !== null) return known[i] === letter;
      const n = left.get(letter) ?? 0;
      left.set(letter, n - 1);
      return n > 0;
    });
    if (fits) result.push(word);
  }
  return result;
}

/**
 * The most useful letter: in the word that still has the most possible answers, the first
 * letter from the start (2nd, then 3rd, ...) that isn't known or right yet.
 */
export function useUsefulHint(state: GameState, words: Iterable<string>, now: number): GameState {
  if (state.status !== "playing" || hintsLeft(state) <= 0) return state;
  const targets = new Set(hintTargets(state));
  const list = [...words];
  let best: { cell: number; count: number } | null = null;
  for (const line of LINE_NAMES) {
    const cell = boardLayout(state).lines[line].find((c) => targets.has(c));
    if (cell === undefined) continue;
    const count = lineCandidates(state, line, list).length;
    if (!best || count > best.count) best = { cell, count };
  }
  return best ? revealCell(state, best.cell, now) : state;
}

function revealCell(state: GameState, cell: number, now: number): GameState {
  const sol = solution(state);
  const letters = boardLetters(state);
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
    ...withCells(state, cells),
    hinted: [...state.hinted, cell],
    hintsUsed: state.hintsUsed + 1,
  };
  return isSolved(next) ? win(next, now) : next;
}

/** Clues that can still be revealed, in board order. */
export function cluesLeft(state: GameState): LineName[] {
  return LINE_NAMES.filter((line) => !(state.clues ?? []).includes(line) && !isLineRight(state, line));
}

/** Reveals the clue of a word: the preferred one if it has none yet, otherwise the first without. */
export function useClue(state: GameState, preferred: LineName | null): GameState {
  if (state.status !== "playing" || hintsLeft(state) <= 0) return state;
  const left = cluesLeft(state);
  const line = preferred && left.includes(preferred) ? preferred : left[0];
  if (!line) return state;
  return { ...state, clues: [...(state.clues ?? []), line], hintsUsed: state.hintsUsed + 1, feedback: null };
}

/** Marks which complete words are right. Costs a hint only when there is something new to check. */
export function useCheck(state: GameState): GameState {
  if (state.status !== "playing" || hintsLeft(state) <= 0) return state;
  const letters = boardLetters(state);
  const lines = boardLayout(state).lines;
  const complete = LINE_NAMES.filter((line) => lines[line].every((cell) => letters[cell] !== ""));
  const already = state.checked ?? [];
  if (complete.every((line) => already.includes(line))) return { ...state, feedback: { kind: "nothing-to-check" } };
  const checked = complete.filter((line) => isLineRight(state, line));
  return {
    ...state,
    checked,
    hintsUsed: state.hintsUsed + 1,
    feedback: { kind: "checked", right: checked.length, complete: complete.length },
  };
}

/** Without a submit button (check hints): a full board is judged right away. */
export function autoSubmit(state: GameState, now: number): GameState {
  if (state.status !== "playing" || !isFull(state)) return state;
  return isSolved(state) ? win(state, now) : { ...state, feedback: { kind: "full" } };
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
