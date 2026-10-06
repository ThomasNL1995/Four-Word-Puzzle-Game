// Board layout for words of length n (4, 5 or 6). The cells of the frame are numbered
// in reading order. For n = 4:
//
//    0  1  2  3      top    = 0 1 2 3
//    4        5      left   = 0 4 6 8
//    6        7      right  = 3 5 7 11
//    8  9 10 11      bottom = 8 9 10 11
//
// A puzzle is stored as [top, bottom, left, right].

export type Puzzle = [string, string, string, string];

export type LineName = "top" | "bottom" | "left" | "right";
export const LINE_NAMES: LineName[] = ["top", "bottom", "left", "right"];

export interface Layout {
  /** Word length. */
  size: number;
  cellCount: number;
  corners: number[];
  /** Cells the player fills, in reading order. */
  editable: number[];
  lines: Record<LineName, number[]>;
  /** Row and column (0-based) of each cell on the size x size grid. */
  positions: [number, number][];
}

export const SIZES = [4, 5, 6] as const;
export type Size = (typeof SIZES)[number];

const layouts = new Map<number, Layout>();

export function layout(size: number): Layout {
  let l = layouts.get(size);
  if (l) return l;
  const n = size;
  const cellCount = 4 * n - 4;
  const bottomStart = cellCount - n;
  const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);
  const left = [0, ...range(0, n - 2).map((i) => n + 2 * i), bottomStart];
  const right = [n - 1, ...range(0, n - 2).map((i) => n + 2 * i + 1), cellCount - 1];
  const corners = [0, n - 1, bottomStart, cellCount - 1];
  const positions: [number, number][] = [
    ...range(0, n).map((c) => [0, c] as [number, number]),
    ...range(1, n - 2).flatMap((r) => [[r, 0] as [number, number], [r, n - 1] as [number, number]]),
    ...range(0, n).map((c) => [n - 1, c] as [number, number]),
  ];
  l = {
    size: n,
    cellCount,
    corners,
    editable: range(0, cellCount).filter((c) => !corners.includes(c)),
    lines: { top: range(0, n), bottom: range(bottomStart, n), left, right },
    positions,
  };
  layouts.set(size, l);
  return l;
}

/** The letters of the solved board, indexed by cell. */
export function solutionLetters(puzzle: Puzzle): string[] {
  const [top, bottom, left, right] = puzzle;
  const { lines, cellCount } = layout(top.length);
  const letters = new Array<string>(cellCount);
  lines.top.forEach((cell, i) => (letters[cell] = top[i]));
  lines.bottom.forEach((cell, i) => (letters[cell] = bottom[i]));
  lines.left.forEach((cell, i) => (letters[cell] = left[i]));
  lines.right.forEach((cell, i) => (letters[cell] = right[i]));
  return letters;
}

/** Reads the four words off a board (cells may be empty strings). */
export function wordsOnBoard(letters: string[], size: number): Record<LineName, string> {
  const { lines } = layout(size);
  const read = (line: readonly number[]) => line.map((i) => letters[i] ?? "").join("");
  return { top: read(lines.top), bottom: read(lines.bottom), left: read(lines.left), right: read(lines.right) };
}

const A = 65; // char code of "A"

const indexCache = new WeakMap<readonly string[], Map<string, string[]>>();

function byEnds(words: readonly string[]): Map<string, string[]> {
  let index = indexCache.get(words);
  if (!index) {
    index = new Map();
    for (const w of words) {
      const key = w[0] + w[w.length - 1];
      const list = index.get(key);
      if (list) list.push(w);
      else index.set(key, [w]);
    }
    indexCache.set(words, index);
  }
  return index;
}

/**
 * Counts how many boards can be built from the puzzle's tiles where all four lines are
 * words from `dictionary` (words of the same length). Stops counting at `limit`.
 */
export function countSolutions(puzzle: Puzzle, dictionary: readonly string[], limit = Infinity): number {
  const [top, bottom] = puzzle;
  const n = top.length;
  const index = byEnds(dictionary);
  const groups = [
    index.get(top[0] + top[n - 1]) ?? [],
    index.get(bottom[0] + bottom[n - 1]) ?? [],
    index.get(top[0] + bottom[0]) ?? [],
    index.get(top[n - 1] + bottom[n - 1]) ?? [],
  ];

  // Letters still available, per letter A..Z. Each word takes its middle letters.
  const available = new Array(26).fill(0);
  for (const word of puzzle) {
    for (let i = 1; i < n - 1; i++) available[word.charCodeAt(i) - A]++;
  }

  let count = 0;
  const search = (depth: number): boolean => {
    if (depth === 4) return ++count >= limit;
    for (const word of groups[depth]) {
      // Take the word's middle letters; stop at the first one that is not available.
      let taken = 1;
      let fits = true;
      for (; taken < n - 1; taken++) {
        if (--available[word.charCodeAt(taken) - A] < 0) {
          taken++;
          fits = false;
          break;
        }
      }
      const done = fits && search(depth + 1);
      for (let i = 1; i < taken; i++) available[word.charCodeAt(i) - A]++;
      if (done) return true;
    }
    return false;
  };
  search(0);
  return count;
}
