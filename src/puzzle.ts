// Board layout. The 12 cells are numbered in reading order:
//
//    0  1  2  3      top    = 0 1 2 3
//    4        5      left   = 0 4 6 8
//    6        7      right  = 3 5 7 11
//    8  9 10 11      bottom = 8 9 10 11
//
// A puzzle is stored as [top, bottom, left, right].

export type Puzzle = [string, string, string, string];

export const CELL_COUNT = 12;
export const CORNERS = [0, 3, 8, 11];
export const EDITABLE = [1, 2, 4, 5, 6, 7, 9, 10];

export const LINES = {
  top: [0, 1, 2, 3],
  bottom: [8, 9, 10, 11],
  left: [0, 4, 6, 8],
  right: [3, 5, 7, 11],
} as const;

export type LineName = keyof typeof LINES;
export const LINE_NAMES: LineName[] = ["top", "bottom", "left", "right"];

/** The 12 letters of the solved board, indexed by cell. */
export function solutionLetters([top, bottom, left, right]: Puzzle): string[] {
  return [top[0], top[1], top[2], top[3], left[1], right[1], left[2], right[2], bottom[0], bottom[1], bottom[2], bottom[3]];
}

/** Reads the four words off a board (cells may be empty strings). */
export function wordsOnBoard(letters: string[]): Record<LineName, string> {
  const read = (line: readonly number[]) => line.map((i) => letters[i] ?? "").join("");
  return { top: read(LINES.top), bottom: read(LINES.bottom), left: read(LINES.left), right: read(LINES.right) };
}

const A = 65; // char code of "A"

const indexCache = new WeakMap<readonly string[], Map<string, string[]>>();

function byEnds(words: readonly string[]): Map<string, string[]> {
  let index = indexCache.get(words);
  if (!index) {
    index = new Map();
    for (const w of words) {
      const key = w[0] + w[3];
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
 * words from `dictionary`. Stops counting at `limit`.
 */
export function countSolutions(puzzle: Puzzle, dictionary: readonly string[], limit = Infinity): number {
  const [top, bottom] = puzzle;
  const index = byEnds(dictionary);
  const groups = [
    index.get(top[0] + top[3]) ?? [],
    index.get(bottom[0] + bottom[3]) ?? [],
    index.get(top[0] + bottom[0]) ?? [],
    index.get(top[3] + bottom[3]) ?? [],
  ];

  // Letters still available, per letter A..Z. Each word takes its two middle letters.
  const available = new Array(26).fill(0);
  for (const word of puzzle) {
    available[word.charCodeAt(1) - A]++;
    available[word.charCodeAt(2) - A]++;
  }

  let count = 0;
  const search = (depth: number): boolean => {
    if (depth === 4) return ++count >= limit;
    for (const word of groups[depth]) {
      const a = word.charCodeAt(1) - A;
      const b = word.charCodeAt(2) - A;
      available[a]--;
      available[b]--;
      const fits = available[a] >= 0 && available[b] >= 0;
      const done = fits && search(depth + 1);
      available[a]++;
      available[b]++;
      if (done) return true;
    }
    return false;
  };
  search(0);
  return count;
}
