// Builds src/data/<n>/definitions.json for every word length: one short definition per
// answer word, so the game never has to call a dictionary service at runtime.
//
//   npm run definitions
//
// Source: Princeton WordNet 3.1 (npm package `wordnet-db`). For each word we take the
// sense that is used most often in WordNet's tagged texts (the tag count in index.sense);
// ties go to the lowest sense number, then noun > verb > adjective > adverb.
// Words WordNet only knows in their base form (asked, making, older) are looked up via
// WordNet's own exception lists and suffix rules, and shown as "past tense of ask: ...".
// scripts/words/definition-overrides.json wins over everything: it covers words WordNet
// doesn't have (that, with, from, ...) and fixes glosses that read badly.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const dict = join(require.resolve("wordnet-db/package.json"), "..", "dict");
const root = new URL("..", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

const SIZES = [4, 5, 6];
const answersBySize = Object.fromEntries(SIZES.map((n) => [n, readJson(`scripts/words/${n}/answers.json`).map(([w]) => w)]));
const answers = SIZES.flatMap((n) => answersBySize[n]);
const overrides = readJson("scripts/words/definition-overrides.json");

// ss_type number in a sense key -> data file and readable part of speech
const SS_TYPES = {
  1: { file: "noun", pos: "noun", rank: 0 },
  2: { file: "verb", pos: "verb", rank: 1 },
  3: { file: "adj", pos: "adjective", rank: 2 },
  5: { file: "adj", pos: "adjective", rank: 2 }, // adjective satellite
  4: { file: "adv", pos: "adverb", rank: 3 },
};

// 0. Base forms for inflected words, the way WordNet's "morphy" finds them.
// wordnet-db doesn't ship WordNet's exception lists, so the common irregular forms
// are listed here.
const IRREGULAR = {
  went: "go", came: "come", took: "take", gave: "give", knew: "know", grew: "grow", wore: "wear", woke: "wake",
  rode: "ride", began: "begin", broke: "break", chose: "choose", drove: "drive", spoke: "speak", stole: "steal",
  threw: "throw", wrote: "write", given: "give", taken: "take", known: "know", drawn: "draw", shown: "show",
  grown: "grow", thrown: "throw", spent: "spend", built: "build", heard: "hear", meant: "mean", stood: "stand",
  bound: "bind", found: "find", fought: "fight", bought: "buy", caught: "catch", taught: "teach", sought: "seek",
  brought: "bring", thought: "think", forgot: "forget", gotten: "get", stolen: "steal", spoken: "speak",
  chosen: "choose", driven: "drive", hidden: "hide", broken: "break", fallen: "fall", frozen: "freeze",
  beaten: "beat", ridden: "ride", written: "write", eaten: "eat", risen: "rise", sworn: "swear", shook: "shake",
  swore: "swear", froze: "freeze", arose: "arise", drank: "drink", drunk: "drink", sang: "sing", swung: "swing",
  stuck: "stick", struck: "strike", slept: "sleep", swept: "sweep", wept: "weep", dealt: "deal", dwelt: "dwell",
  felt: "feel", kept: "keep", lent: "lend", sent: "send", told: "tell", sold: "sell", held: "hold", fled: "flee",
  laid: "lay", paid: "pay", said: "say", lost: "lose", lying: "lie", dying: "die", tying: "tie", worse: "bad",
  worst: "bad", better: "good", best: "good",
};
const exceptions = { verb: new Map(Object.entries(IRREGULAR)), adj: new Map() };
const lemmas = new Set();
for (const line of readFileSync(join(dict, "index.sense"), "utf8").split("\n")) {
  if (line) lemmas.add(line.slice(0, line.indexOf("%")));
}
const VERB_RULES = [["ies", "y"], ["es", "e"], ["es", ""], ["s", ""], ["ied", "y"], ["ed", "e"], ["ed", ""], ["ing", "e"], ["ing", ""]];
const ADJ_RULES = [["ier", "y"], ["iest", "y"], ["er", ""], ["est", ""], ["er", "e"], ["est", "e"]];
function describeForm(word, base) {
  if (word.endsWith("ed") || (IRREGULAR[word] && !word.endsWith("ing") && !["worse", "worst", "better", "best"].includes(word))) return "past tense of";
  if (["worse", "better"].includes(word)) return "comparative of";
  if (["worst", "best"].includes(word)) return "superlative of";
  if (word.endsWith("ing")) return "-ing form of";
  if (word.endsWith("er") && !base.endsWith("er")) return "comparative of";
  if (word.endsWith("est")) return "superlative of";
  return "form of";
}
function baseForm(word) {
  const excVerb = exceptions.verb.get(word);
  if (excVerb && lemmas.has(excVerb)) return excVerb;
  const excAdj = exceptions.adj.get(word);
  if (excAdj && lemmas.has(excAdj)) return excAdj;
  for (const [suffix, ending] of [...VERB_RULES, ...ADJ_RULES]) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    for (const candidate of [stem + ending, stem.length > 2 && stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) + ending : null]) {
      if (candidate && candidate.length >= 2 && lemmas.has(candidate)) return candidate;
    }
  }
  return null;
}

// 1. Best sense per lemma from index.sense: "lemma%ss_type:... offset sense_number tag_cnt"
const bases = new Map();
for (const w of answers) {
  const lower = w.toLowerCase();
  if (!lemmas.has(lower)) {
    const base = baseForm(lower);
    if (base) bases.set(lower, base);
  }
}
const wanted = new Set([...answers.map((w) => w.toLowerCase()), ...bases.values()]);
const best = new Map();
for (const line of readFileSync(join(dict, "index.sense"), "utf8").split("\n")) {
  if (!line) continue;
  const [key, offset, senseNumber, tagCount] = line.split(" ");
  const lemma = key.slice(0, key.indexOf("%"));
  if (!wanted.has(lemma)) continue;
  const type = SS_TYPES[key[key.indexOf("%") + 1]];
  const candidate = { offset, type, sense: Number(senseNumber), tags: Number(tagCount) };
  const current = best.get(lemma);
  const better =
    !current ||
    candidate.tags > current.tags ||
    (candidate.tags === current.tags &&
      (candidate.sense < current.sense || (candidate.sense === current.sense && candidate.type.rank < current.type.rank)));
  if (better) best.set(lemma, candidate);
}

// 2. Glosses from the data files. The byte offset in the sense key points at the line.
const dataFiles = {};
function gloss({ offset, type }) {
  dataFiles[type.file] ??= readFileSync(join(dict, `data.${type.file}`));
  const buf = dataFiles[type.file];
  const start = Number(offset);
  const end = buf.indexOf(10, start);
  const line = buf.subarray(start, end).toString("utf8");
  const text = line.slice(line.indexOf("| ") + 2);
  // Keep the definition, drop the example sentences ("...; "an example"").
  // WordNet quotes like `this'; use normal quotes.
  return text.split(/;\s*"/)[0].trim().replace(/`([^']*)'/g, "'$1'");
}

function define(word) {
  if (overrides[word]) return overrides[word];
  const lower = word.toLowerCase();
  const sense = best.get(lower);
  if (sense) return { pos: sense.type.pos, text: gloss(sense) };
  const base = bases.get(lower);
  const baseSense = base && best.get(base);
  if (baseSense) return { pos: baseSense.type.pos, text: `${describeForm(lower, base)} ${base}: ${gloss(baseSense)}` };
  return null;
}

// 3. Write one file per size. Every word that appears in a puzzle must have a definition.
const allMissing = [];
for (const n of SIZES) {
  const puzzles = readJson(`src/data/${n}/puzzles.json`);
  const used = new Set([...puzzles.daily, ...puzzles.practice].flat());
  const definitions = {};
  const missing = [];
  for (const word of answersBySize[n]) {
    const def = define(word);
    if (def) definitions[word] = def;
    else if (used.has(word)) missing.push(word);
  }
  allMissing.push(...missing);
  const sorted = Object.fromEntries(Object.entries(definitions).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(new URL(`src/data/${n}/definitions.json`, root), JSON.stringify(sorted));
  console.log(`${n} letters: ${Object.keys(definitions).length} definitions, ${missing.length} puzzle words missing`);
}
if (allMissing.length) {
  throw new Error(`No definition for ${allMissing.length} puzzle words, add them to definition-overrides.json:\n${allMissing.join(" ")}`);
}
