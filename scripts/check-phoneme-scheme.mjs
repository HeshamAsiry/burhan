#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const ts = fs.readFileSync(
  path.join(process.cwd(), "lib/burhan/phoneme-scheme.ts"),
  "utf8",
);

function transpile(source) {
  return source
    .replace(/export type[\s\S]*?;\n\n/, "")
    .replace(/export function /g, "function ")
    .replace(/export const /g, "const ")
    .replace(/: Record<string, CanonicalPhoneme>/g, "")
    .replace(/: CanonicalPhoneme/g, "")
    .replace(/: string\[\]/g, "")
    .replace(/: string/g, "")
    .replace(/: number/g, "")
    .replace(/: boolean/g, "")
    .replace(/\| [^\n]+/g, "")
    .replace(/ as string\[\]/g, "");
}

const transformed = transpile(ts).replace(
  /const NAWAR_VALUES/,
  "const exported = { canonicalizePhoneme, canonicalizePhonemeSequence, countUnknownPhonemes };\nconst NAWAR_VALUES",
);

const context = {};
vm.createContext(context);
vm.runInContext(transformed, context);

const { canonicalizePhoneme, canonicalizePhonemeSequence, countUnknownPhonemes } =
  context.exported;

const expected = ["ʔ", "m", "a:", "l", "i", "k", "rˤ", "sˤ", "aˤ:"];
const predicted = ["<", "m", "aa", "l", "i", "k", "r", "S", "AA"];

const expectedCanonical = canonicalizePhonemeSequence(expected);
const predictedCanonical = canonicalizePhonemeSequence(predicted);

if (JSON.stringify(expectedCanonical) !== JSON.stringify(predictedCanonical)) {
  throw new Error(
    "Expected equivalent Nawar/Burhan phoneme sequences.\n" +
      JSON.stringify(expectedCanonical) +
      "\n" +
      JSON.stringify(predictedCanonical),
  );
}

if (canonicalizePhoneme("unknown_token") !== null) {
  throw new Error("Unknown phoneme must normalize to null.");
}

if (countUnknownPhonemes(predicted) !== 0) {
  throw new Error("Predicted fixture contains no unknown phonemes.");
}

console.log("phoneme scheme normalization checks passed");
