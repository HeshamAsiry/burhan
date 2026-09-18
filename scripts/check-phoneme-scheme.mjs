import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(
  path.join(process.cwd(), "lib/burhan/phoneme-scheme.ts"),
  "utf8",
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

const context = {
  module: { exports: {} },
  exports: {},
};

vm.createContext(context);
vm.runInContext(compiled, context);

const {
  canonicalizePhoneme,
  canonicalizePhonemeSequence,
  countUnknownPhonemes,
} = context.module.exports;

const expected = ["ʔ", "m", "a:", "l", "i", "k", "rˤ", "sˤ", "aˤ:"];
const predicted = ["<", "m", "aa", "l", "i", "k", "r", "S", "AA"];

const expectedCanonical = canonicalizePhonemeSequence(expected);
const predictedCanonical = canonicalizePhonemeSequence(predicted);

if (JSON.stringify(expectedCanonical) !== JSON.stringify(predictedCanonical)) {
  throw new Error(
    "Expected equivalent Burhan/Nawar phoneme sequences.\n" +
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

if (countUnknownPhonemes(["ʔ", "not-a-phoneme"]) !== 1) {
  throw new Error("Unknown phoneme counting is incorrect.");
}

console.log("phoneme scheme normalization checks passed");
