import { describe, expect, it } from "vitest";
import { dailyPuzzle, loadDefinitions, loadPuzzleSet, puzzleDate, puzzleNumber } from "./daily.ts";
import { countSolutions, layout, solutionLetters, SIZES } from "./puzzle.ts";
import { decodeChallenge, emojiBoard, encodeChallenge, formatTime } from "./share.ts";
import { emptyStats, liveStreak, recordDailyStart, recordDailyWin, recordResult } from "./stats.ts";

describe("puzzle", () => {
  it("maps words onto the board", () => {
    expect(solutionLetters(["PURE", "DAWN", "PAID", "EARN"]).join("")).toBe("PUREAAIRDAWN");
  });

  it("maps 5 and 6 letter words onto the board", () => {
    expect(solutionLetters(["NEVER", "LUNAR", "NOVEL", "ROVER"]).join("")).toBe("NEVEROOVVEELUNAR");
    expect(layout(6).cellCount).toBe(20);
    expect(layout(6).editable).toHaveLength(16);
    expect(layout(5).lines.right).toEqual([4, 6, 8, 10, 15]);
  });

  it("finds alternative solutions", () => {
    // TROT/TORT: both real words, same letters.
    expect(countSolutions(["TROT", "LEAF", "TOIL", "TIFF"], ["TROT", "TORT", "LEAF", "TOIL", "TIFF"])).toBe(2);
    expect(countSolutions(["TROT", "LEAF", "TOIL", "TIFF"], ["TROT", "LEAF", "TOIL", "TIFF"])).toBe(1);
  });
});

describe.each(SIZES)("shipped %i-letter puzzles", (size) => {
  it("has more than five years of daily puzzles", async () => {
    const set = await loadPuzzleSet(size);
    expect(set.daily.length).toBeGreaterThanOrEqual(5 * 365 + 1);
    expect(set.practice.length).toBeGreaterThan(0);
    expect(set.daily.flat().every((w) => w.length === size)).toBe(true);
  });

  it("every puzzle has exactly one solution", async () => {
    const set = await loadPuzzleSet(size);
    const valid = [...set.valid];
    for (const p of [...set.daily, ...set.practice]) {
      expect(countSolutions(p, valid, 2), p.join(" ")).toBe(1);
    }
  });

  it("every puzzle word has a definition", async () => {
    const set = await loadPuzzleSet(size);
    const defs = await loadDefinitions(size);
    for (const word of new Set([...set.daily, ...set.practice].flat())) {
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

  it("maps puzzle numbers back to dates", () => {
    expect(puzzleDate(1).toDateString()).toBe(new Date(2026, 9, 6).toDateString());
    expect(puzzleNumber(puzzleDate(176))).toBe(176);
  });

  it("wraps around after the last puzzle", async () => {
    const set = await loadPuzzleSet(4);
    expect(dailyPuzzle(set, set.daily.length + 1)).toEqual(dailyPuzzle(set, 1));
  });
});

describe("share", () => {
  it("round-trips challenge codes", () => {
    const c = { ref: { kind: "daily" as const, size: 4, number: 142 }, hints: 1, seconds: 83 };
    expect(decodeChallenge(encodeChallenge(c))).toEqual(c);
    const p = { ref: { kind: "practice" as const, size: 6, index: 7 }, hints: 0, seconds: 30 };
    expect(decodeChallenge(encodeChallenge(p))).toEqual(p);
    const d5 = { ref: { kind: "daily" as const, size: 5, number: 3 }, hints: 2, seconds: 300 };
    expect(decodeChallenge(encodeChallenge(d5))).toEqual(d5);
  });

  it("still reads 4-letter codes shared before sizes existed", () => {
    // "d.142.1.83" plus checksum, as encoded by the first version.
    const old = encodeChallenge({ ref: { kind: "daily", size: 4, number: 142 }, hints: 1, seconds: 83 });
    expect(atob(old.replace(/-/g, "+").replace(/_/g, "/")).startsWith("d.142.1.83.")).toBe(true);
  });

  it("rejects tampered or garbage codes", () => {
    const code = encodeChallenge({ ref: { kind: "daily", size: 4, number: 142 }, hints: 3, seconds: 83 });
    const tampered = btoa(atob(code.replace(/-/g, "+").replace(/_/g, "/")).replace(".3.", ".0."));
    expect(decodeChallenge(tampered)).toBeNull();
    expect(decodeChallenge("nonsense!")).toBeNull();
  });

  it("formats time and the emoji board", () => {
    expect(formatTime(83)).toBe("1:23");
    expect(emojiBoard([5])).toBe("⬛🟩🟩⬛\n🟩⬜⬜🟨\n🟩⬜⬜🟩\n⬛🟩🟩⬛");
    expect(emojiBoard([], 5).split("\n")).toEqual(["⬛🟩🟩🟩⬛", "🟩⬜⬜⬜🟩", "🟩⬜⬜⬜🟩", "🟩⬜⬜⬜🟩", "⬛🟩🟩🟩⬛"]);
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

  it("has a hint bar for every possible hint count", () => {
    expect(emptyStats().hintDistribution).toHaveLength(9);
  });

  it("keeps the first result of a day", () => {
    let r = recordResult({}, 3, { hints: 2, wrong: 0, seconds: 50 });
    r = recordResult(r, 3, { hints: 0, wrong: 0, seconds: 20 });
    expect(r[3].hints).toBe(2);
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
