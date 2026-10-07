import { describe, expect, it } from "vitest";
import { layout, type Puzzle } from "./puzzle.ts";
import {
  boardLetters,
  cellOfTile,
  clearBoard,
  elapsedMs,
  isSolved,
  maxHints,
  moveTile,
  newGame,
  pause,
  resume,
  solution,
  CLUE_HINTS,
  LETTER_HINTS,
  lettersLeft,
  submit,
  useClue,
  useLetterHint,
  type GameState,
} from "./state.ts";

// TROT / TORT is the classic trap: same letters, both real words.
const PUZZLE: Puzzle = ["PURE", "DAWN", "PAID", "EARN"];
const VALID = new Set(["PURE", "DAWN", "PAID", "EARN", "PARE", "DUWN"]);
const noShuffle = () => 0.999999; // shuffle() keeps the order with this

function tileFor(state: GameState, letter: string, skip: number[] = []): number {
  return state.tiles.findIndex((l, t) => l === letter && cellOfTile(state, t) === -1 && !skip.includes(t));
}

/** Places the correct letters in all editable cells. */
function solve(state: GameState): GameState {
  const sol = solution(state);
  for (const cell of layout(state.puzzle[0].length).editable) {
    if (state.cells[cell] !== null) continue;
    state = moveTile(state, tileFor(state, sol[cell]), cell);
  }
  return state;
}

describe("newGame", () => {
  it("starts with an empty board, given corners and 8 tiles", () => {
    const s = newGame(PUZZLE, 0, noShuffle);
    expect(boardLetters(s)).toEqual(["P", "", "", "E", "", "", "", "", "D", "", "", "N"]);
    expect([...s.tiles].sort()).toEqual(["A", "A", "A", "I", "R", "R", "U", "W"]);
    expect(s.status).toBe("playing");
  });
});

describe("moveTile", () => {
  it("places, swaps and returns tiles", () => {
    let s = newGame(PUZZLE, 0);
    const u = tileFor(s, "U");
    const w = tileFor(s, "W");
    s = moveTile(s, u, 1);
    expect(boardLetters(s)[1]).toBe("U");

    // Tray tile onto an occupied cell: the occupant goes back to the tray.
    s = moveTile(s, w, 1);
    expect(boardLetters(s)[1]).toBe("W");
    expect(cellOfTile(s, u)).toBe(-1);

    // Board tile onto another occupied cell: they swap.
    s = moveTile(s, u, 2);
    s = moveTile(s, w, 2);
    expect(boardLetters(s)[2]).toBe("W");
    expect(boardLetters(s)[1]).toBe("U");

    // Back to the tray.
    s = moveTile(s, w, null);
    expect(cellOfTile(s, w)).toBe(-1);
  });

  it("refuses corners", () => {
    const s = newGame(PUZZLE, 0);
    expect(moveTile(s, 0, 0)).toBe(s);
  });
});

describe("submit", () => {
  it("asks to fill all squares first", () => {
    const s = submit(newGame(PUZZLE, 0), VALID, 0);
    expect(s.feedback).toEqual({ kind: "incomplete" });
    expect(s.wrongSubmits).toBe(0);
  });

  it("wins on the right answer and stops the clock", () => {
    const s = submit(solve(newGame(PUZZLE, 1000)), VALID, 61_000);
    expect(s.status).toBe("won");
    expect(elapsedMs(s, 999_999)).toBe(60_000);
  });

  it("counts wrong answers without saying which words are right", () => {
    let s = solve(newGame(PUZZLE, 0));
    // Swap U (top) and A (left): top becomes PARE, left becomes PUID.
    const u = s.cells[1]!;
    s = moveTile(s, u, 4);
    s = submit(s, VALID, 0);
    expect(s.status).toBe("playing");
    expect(s.wrongSubmits).toBe(1);
    expect(s.feedback).toEqual({ kind: "wrong" });
  });

  it("accepts any tile with the right letter (duplicate letters)", () => {
    let s = solve(newGame(PUZZLE, 0));
    // cells 4 (left A) and 5 (right A) both hold an A: swapping them changes nothing.
    s = moveTile(s, s.cells[4]!, 5);
    expect(isSolved(s)).toBe(true);
  });
});

describe("letter hints", () => {
  // Board cells: top 0-3, left 0,4,6,8, right 3,5,7,11, bottom 8-11.
  it("reveal the 3rd letter of the chosen word and lock it", () => {
    let s = newGame(PUZZLE, 0);
    s = useLetterHint(s, "left", 0);
    expect(s.hinted).toEqual([6]); // PAID: I
    expect(boardLetters(s)[6]).toBe("I");
    expect(s.hintsUsed).toBe(1);
    // Locked: can't move it or clear it.
    const tile = s.cells[6]!;
    expect(moveTile(s, tile, null)).toBe(s);
    expect(clearBoard(s).cells[6]).toBe(tile);
    expect(lettersLeft(s)).toEqual(["top", "bottom", "right"]);
  });

  it("go to the next word in board order when the chosen one is used", () => {
    let s = newGame(PUZZLE, 0);
    s = useLetterHint(s, "left", 0);
    s = useLetterHint(s, "left", 0);
    expect(s.hinted).toEqual([6, 2]); // then top: PURE, R
  });

  it("lock a letter the player already has right", () => {
    let s = newGame(PUZZLE, 0);
    s = moveTile(s, tileFor(s, "R"), 2);
    const before = s.cells[2];
    s = useLetterHint(s, "top", 0);
    expect(s.hinted).toEqual([2]);
    expect(s.cells[2]).toBe(before);
  });

  it("take the tile from a wrong spot when the tray has none", () => {
    let s = newGame(PUZZLE, 0);
    const w = tileFor(s, "W");
    s = moveTile(s, w, 1); // W in a wrong cell
    s = useLetterHint(s, "bottom", 0); // DAWN: W goes to cell 10
    expect(boardLetters(s)[10]).toBe("W");
    expect(boardLetters(s)[1]).toBe("");
  });

  it("allow four, then stop", () => {
    let s = newGame(PUZZLE, 0);
    for (let i = 0; i < 6; i++) s = useLetterHint(s, null, 0);
    expect(s.hinted).toHaveLength(LETTER_HINTS);
    expect(s.hintsUsed).toBe(4);
  });

  it("win when the hint completes the board", () => {
    let s = solve(newGame(PUZZLE, 0));
    s = moveTile(s, s.cells[10]!, null);
    s = useLetterHint(s, "bottom", 5000);
    expect(s.status).toBe("won");
  });
});

describe("clues", () => {
  it("reveal the clue of the chosen word, or the next one without a clue", () => {
    let s = newGame(PUZZLE, 0);
    s = useClue(s, "left");
    s = useClue(s, "left");
    expect(s.clues).toEqual(["left", "top"]);
    expect(s.hintsUsed).toBe(2);
  });

  it("stop after every word has a clue, and count with letter hints", () => {
    let s = newGame(PUZZLE, 0);
    for (let i = 0; i < 6; i++) s = useClue(s, null);
    s = useLetterHint(s, null, 0);
    expect(s.clues).toHaveLength(CLUE_HINTS);
    expect(s.hintsUsed).toBe(5);
    expect(maxHints()).toBe(8);
  });
});

describe("bigger boards", () => {
  it("plays a 6-letter puzzle", () => {
    const p: Puzzle = ["STATUE", "STRICT", "STRESS", "EFFORT"];
    let s = newGame(p, 0);
    expect(s.tiles).toHaveLength(16);
    s = solve(s);
    s = submit(s, new Set(p), 1000);
    expect(s.status).toBe("won");
  });
});

describe("pause and resume", () => {
  it("does not count paused time", () => {
    let s = newGame(PUZZLE, 0);
    s = pause(s, 10_000);
    s = resume(s, 50_000);
    expect(elapsedMs(s, 55_000)).toBe(15_000);
  });

  it("ignores moves while paused", () => {
    const s = pause(newGame(PUZZLE, 0), 0);
    expect(moveTile(s, 0, 1)).toBe(s);
  });
});
