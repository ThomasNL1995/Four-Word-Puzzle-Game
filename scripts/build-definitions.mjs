// Builds src/data/definitions.json: one short definition per answer word, so the game
// never has to call a dictionary service at runtime.
//
//   npm run definitions
//
// Source: Princeton WordNet 3.1 (npm package `wordnet-db`). For each word we take the
// sense that is used most often in WordNet's tagged texts (the tag count in index.sense);
// ties go to the lowest sense number, then noun > verb > adjective > adverb.
// scripts/definition-overrides.json wins over WordNet: it covers words WordNet doesn't
// have (that, with, from, ...) and fixes glosses that read badly.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const dict = join(require.resolve("wordnet-db/package.json"), "..", "dict");
const root = new URL("..", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

const answers = readJson("scripts/answer-words.json").map(([w]) => w);
const overrides = readJson("scripts/definition-overrides.json");
const puzzles = readJson("src/data/puzzles.json");

// ss_type number in a sense key -> data file and readable part of speech
const SS_TYPES = {
  1: { file: "noun", pos: "noun", rank: 0 },
  2: { file: "verb", pos: "verb", rank: 1 },
  3: { file: "adj", pos: "adjective", rank: 2 },
  5: { file: "adj", pos: "adjective", rank: 2 }, // adjective satellite
  4: { file: "adv", pos: "adverb", rank: 3 },
};

// 1. Best sense per lemma from index.sense: "lemma%ss_type:... offset sense_number tag_cnt"
const wanted = new Set(answers.map((w) => w.toLowerCase()));
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

const definitions = {};
const missing = [];
for (const word of answers) {
  const override = overrides[word];
  if (override) {
    definitions[word] = override;
    continue;
  }
  const sense = best.get(word.toLowerCase());
  if (!sense) {
    missing.push(word);
    continue;
  }
  definitions[word] = { pos: sense.type.pos, text: gloss(sense) };
}

// 3. Every word that appears in a puzzle must have a definition.
const used = new Set([...puzzles.daily, ...puzzles.practice].flat());
const usedMissing = missing.filter((w) => used.has(w));
if (usedMissing.length) {
  throw new Error(`No definition for ${usedMissing.length} puzzle words, add them to definition-overrides.json:\n${usedMissing.join(" ")}`);
}

const sorted = Object.fromEntries(Object.entries(definitions).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL("src/data/definitions.json", root), JSON.stringify(sorted));
console.log(
  `definitions: ${Object.keys(definitions).length} (${Object.keys(overrides).length} overrides), ` +
    `not defined and not used in any puzzle: ${missing.length}`
);
