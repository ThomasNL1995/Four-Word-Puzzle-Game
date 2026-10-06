// Generates the ordered puzzle list used by the game.
//
//   node scripts/generate-puzzles.mjs
//
// Reads scripts/answer-words.json and src/data/valid-words.json (see build-wordlists.py),
// writes src/data/puzzles.json: { daily: Puzzle[], practice: Puzzle[] }
// where Puzzle = [top, bottom, left, right].
//
// Rules for every puzzle:
//  - all four words come from the answer list, all different
//  - exactly one solution: no other grid with the same corners and the same 8 letters
//    can be made from the (bigger) valid word list
//  - at most one "hard" word (low frequency)
// Rules for the daily order:
//  - no word repeats within REPEAT_GAP days
//  - words are spread evenly (least-used words are preferred)
//  - easier puzzles early in the week, harder ones towards the weekend

import { readFileSync, writeFileSync } from "node:fs";
import { countSolutions } from "../src/puzzle.ts";

const DAILY_COUNT = 2200; // a bit more than 6 years
const PRACTICE_COUNT = 3000;
const POOL_TARGET = 20000;
const REPEAT_GAP = 90;
const HARD_ZIPF = 3.3;
const SEED = 20231;

const root = new URL("..", import.meta.url);
const answers = JSON.parse(readFileSync(new URL("scripts/answer-words.json", root), "utf8"));
const valid = JSON.parse(readFileSync(new URL("src/data/valid-words.json", root), "utf8"));
const zipf = new Map(answers.map(([w, z]) => [w, z]));
const answerWords = answers.map(([w]) => w);

// Small seeded PRNG so the output is reproducible.
let state = SEED;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const byEnds = new Map();
for (const w of answerWords) {
  const key = w[0] + w[3];
  if (!byEnds.has(key)) byEnds.set(key, []);
  byEnds.get(key).push(w);
}

function difficulty(p) {
  return p.reduce((sum, w) => sum + zipf.get(w), 0) / 4;
}

// 1. Build a large pool of valid, unique puzzles.
const pool = new Map();
let attempts = 0;
while (pool.size < POOL_TARGET && attempts < POOL_TARGET * 40) {
  attempts++;
  const top = pick(answerWords);
  const bottom = pick(answerWords);
  const lefts = byEnds.get(top[0] + bottom[0]);
  const rights = byEnds.get(top[3] + bottom[3]);
  if (!lefts || !rights) continue;
  const p = [top, bottom, pick(lefts), pick(rights)];
  if (new Set(p).size < 4) continue;
  if (p.filter((w) => zipf.get(w) < HARD_ZIPF).length > 1) continue;
  const key = p.join(",");
  if (pool.has(key)) continue;
  if (countSolutions(p, valid, 2) !== 1) continue;
  pool.set(key, p);
}
console.log(`pool: ${pool.size} unique puzzles from ${attempts} attempts`);

// 2. Order the daily puzzles.
const candidates = [...pool.values()];
const lastUsed = new Map();
const useCount = new Map();
const used = new Set();
const daily = [];
// Monday..Sunday target difficulty: higher zipf = easier.
const sorted = candidates.map(difficulty).sort((a, b) => a - b);
const quantile = (q) => sorted[Math.floor(q * (sorted.length - 1))];
const weekTargets = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25].map(quantile);
const DAY0_WEEKDAY = 0; // index 0 of the list is treated as a Monday

for (let day = 0; day < DAILY_COUNT; day++) {
  const target = weekTargets[(day + DAY0_WEEKDAY) % 7];
  let best = null;
  let bestScore = Infinity;
  // Sample instead of scanning everything; plenty for a good spread.
  for (let i = 0; i < 4000; i++) {
    const p = pick(candidates);
    const key = p.join(",");
    if (used.has(key)) continue;
    if (p.some((w) => lastUsed.has(w) && day - lastUsed.get(w) < REPEAT_GAP)) continue;
    const uses = p.reduce((s, w) => s + (useCount.get(w) ?? 0), 0);
    const score = uses * 2 + Math.abs(difficulty(p) - target) * 3;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (!best) throw new Error(`could not find a puzzle for day ${day}`);
  daily.push(best);
  used.add(best.join(","));
  for (const w of best) {
    lastUsed.set(w, day);
    useCount.set(w, (useCount.get(w) ?? 0) + 1);
  }
}

// 3. Practice puzzles: anything left over.
const practice = candidates.filter((p) => !used.has(p.join(","))).slice(0, PRACTICE_COUNT);

// 4. Assertions.
const answerSet = new Set(answerWords);
const seenWordDay = new Map();
daily.forEach((p, day) => {
  if (!p.every((w) => answerSet.has(w))) throw new Error(`non-answer word on day ${day}`);
  if (countSolutions(p, valid, 2) !== 1) throw new Error(`day ${day} is not unique`);
  for (const w of p) {
    if (seenWordDay.has(w) && day - seenWordDay.get(w) < REPEAT_GAP) throw new Error(`${w} repeats too soon on day ${day}`);
    seenWordDay.set(w, day);
  }
});
if (daily.length < 1826) throw new Error("fewer than 5 years of puzzles");
if (new Set(daily.map((p) => p.join(","))).size !== daily.length) throw new Error("duplicate daily puzzle");

const counts = [...useCount.values()];
console.log(
  `daily: ${daily.length}, practice: ${practice.length}, distinct words used: ${useCount.size}/${answerWords.length}, ` +
    `max uses per word: ${Math.max(...counts)}`
);

writeFileSync(new URL("src/data/puzzles.json", root), JSON.stringify({ daily, practice }));
