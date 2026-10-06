import { describe, expect, it } from "vitest";
import { dailyPuzzle, dailyPuzzles, practicePuzzles, puzzleNumber } from "./daily.ts";
import definitions from "./data/definitions.json";
import validWords from "./data/valid-words.json";
import { countSolutions, solutionLetters } from "./puzzle.ts";
import { decodeChallenge, emojiBoard, encodeChallenge, formatTime } from "./share.ts";
import { emptyStats, liveStreak, recordDailyStart, recordDailyWin } from "./stats.ts";

describe("puzzle", () => {
  it("maps words onto the board", () => {
    expect(solutionLetters(["PURE", "DAWN", "PAID", "EARN"]).join("")).toBe("PUREAAIRDAWN");
  });

  it("finds alternative solutions", () => {
    // TROT/TORT: both real words, same letters.
    expect(countSolutions(["TROT", "LEAF", "TOIL", "TIFF"], ["TROT", "TORT", "LEAF", "TOIL", "TIFF"])).toBe(2);
    expect(countSolutions(["TROT", "LEAF", "TOIL", "TIFF"], ["TROT", "LEAF", "TOIL", "TIFF"])).toBe(1);
  });
});

describe("shipped puzzles", () => {
  it("has more than five years of daily puzzles", () => {
    expect(dailyPuzzles.length).toBeGreaterThanOrEqual(5 * 365 + 1);
    expect(practicePuzzles.length).toBeGreaterThan(0);
  });

  it("every puzzle has exactly one solution", () => {
    for (const p of [...dailyPuzzles, ...practicePuzzles]) {
      expect(countSolutions(p, validWords, 2), p.join(" ")).toBe(1);
    }
  });
});

describe("definitions", () => {
  it("every puzzle word has a definition", () => {
    const defs = definitions as Record<string, { pos: string; text: string }>;
    for (const word of new Set([...dailyPuzzles, ...practicePuzzles].flat())) {
      expect(defs[word]?.text, word).toBeTruthy();
    }
  });
});

describe("daily", () => {
  it("numbers days in local time, starting at #1", () => {
    expect(puzzleNumber(new Date(2026, 9, 6, 0, 1))).toBe(1);
    expect(puzzleNumber(new Date(2026, 9, 6, 23, 59))).toBe(1);
    expect(puzzleNumber(new Date(2026, 9, 7, 0, 0))).toBe(2);
    // Across a DST change.
    expect(puzzleNumber(new Date(2027, 2, 30, 12))).toBe(176);
  });

  it("wraps around after the last puzzle", () => {
    expect(dailyPuzzle(dailyPuzzles.length + 1)).toEqual(dailyPuzzle(1));
  });
});

describe("share", () => {
  it("round-trips challenge codes", () => {
    const c = { ref: { kind: "daily" as const, number: 142 }, hints: 1, seconds: 83 };
    expect(decodeChallenge(encodeChallenge(c))).toEqual(c);
    const p = { ref: { kind: "practice" as const, index: 7 }, hints: 0, seconds: 30 };
    expect(decodeChallenge(encodeChallenge(p))).toEqual(p);
  });

  it("rejects tampered or garbage codes", () => {
    const code = encodeChallenge({ ref: { kind: "daily", number: 142 }, hints: 3, seconds: 83 });
    const tampered = btoa(atob(code.replace(/-/g, "+").replace(/_/g, "/")).replace(".3.", ".0."));
    expect(decodeChallenge(tampered)).toBeNull();
    expect(decodeChallenge("nonsense!")).toBeNull();
  });

  it("formats time and the emoji board", () => {
    expect(formatTime(83)).toBe("1:23");
    expect(emojiBoard([5])).toBe("⬛🟩🟩⬛\n🟩⬜⬜🟨\n🟩⬜⬜🟩\n⬛🟩🟩⬛");
  });
});

describe("stats", () => {
  it("tracks streaks", () => {
    let s = emptyStats();
    s = recordDailyWin(recordDailyStart(s, 10), 10, 0, 60);
    s = recordDailyWin(recordDailyStart(s, 11), 11, 2, 90);
    expect(s.currentStreak).toBe(2);
    expect(s.hintDistribution[0]).toBe(1);
    expect(s.hintDistribution[2]).toBe(1);
    expect(liveStreak(s, 12)).toBe(2);
    expect(liveStreak(s, 13)).toBe(0);

    s = recordDailyWin(recordDailyStart(s, 14), 14, 1, 45);
    expect(s.currentStreak).toBe(1);
    expect(s.maxStreak).toBe(2);
    expect(s.bestSeconds).toBe(45);
    expect(s.played).toBe(3);
  });

  it("counts a day only once", () => {
    let s = recordDailyStart(emptyStats(), 5);
    s = recordDailyStart(s, 5);
    s = recordDailyWin(s, 5, 0, 10);
    s = recordDailyWin(s, 5, 0, 10);
    expect(s.played).toBe(1);
    expect(s.solved).toBe(1);
  });
});
