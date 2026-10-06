import { describe, expect, it } from "vitest";
import { EDITABLE, type Puzzle } from "./puzzle.ts";
import {
  boardLetters,
  cellOfTile,
  clearBoard,
  elapsedMs,
  isSolved,
  MAX_HINTS,
  moveTile,
  newGame,
  pause,
  resume,
  solution,
  submit,
  useHint,
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
  for (const cell of EDITABLE) {
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

  it("counts wrong answers and reports correct lines", () => {
    let s = solve(newGame(PUZZLE, 0));
    // Swap U (top) and A (left): top becomes PARE, left becomes PUID.
    const u = s.cells[1]!;
    s = moveTile(s, u, 4);
    s = submit(s, VALID, 0);
    expect(s.status).toBe("playing");
    expect(s.wrongSubmits).toBe(1);
    expect(s.feedback?.kind).toBe("wrong");
    if (s.feedback?.kind === "wrong") expect(s.feedback.correctLines).toEqual(["bottom", "right"]);
  });

  it("accepts any tile with the right letter (duplicate letters)", () => {
    let s = solve(newGame(PUZZLE, 0));
    // cells 4 (left A) and 5 (right A) both hold an A: swapping them changes nothing.
    s = moveTile(s, s.cells[4]!, 5);
    expect(isSolved(s)).toBe(true);
  });
});

describe("useHint", () => {
  it("fills a wrong cell with the right letter and locks it", () => {
    let s = newGame(PUZZLE, 0);
    s = useHint(s, 0, () => 0);
    expect(s.hintsUsed).toBe(1);
    const cell = s.hinted[0];
    expect(boardLetters(s)[cell]).toBe(solution(s)[cell]);
    // Locked: can't move it or clear it.
    const tile = s.cells[cell]!;
    expect(moveTile(s, tile, null)).toBe(s);
    expect(clearBoard(s).cells[cell]).toBe(tile);
  });

  it("never spends a hint on a cell that is already right", () => {
    let s = solve(newGame(PUZZLE, 0));
    s = moveTile(s, s.cells[1]!, null); // only cell 1 is wrong now
    s = useHint(s, 0, () => 0);
    expect(s.hinted).toEqual([1]);
  });

  it("takes the tile from a wrong spot when the tray has none", () => {
    let s = newGame(PUZZLE, 0);
    const u = tileFor(s, "U");
    s = moveTile(s, u, 9); // U in a wrong cell
    s = useHint(s, 0, () => 0); // first target is cell 1, which needs U
    expect(s.hinted).toEqual([1]);
    expect(boardLetters(s)[1]).toBe("U");
    expect(boardLetters(s)[9]).toBe("");
  });

  it("allows at most MAX_HINTS", () => {
    let s = newGame(PUZZLE, 0);
    for (let i = 0; i < 10; i++) s = useHint(s, 0);
    expect(s.hintsUsed).toBe(MAX_HINTS);
  });

  it("wins when the hint completes the board", () => {
    let s = solve(newGame(PUZZLE, 0));
    s = moveTile(s, s.cells[10]!, null);
    s = useHint(s, 5000);
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
