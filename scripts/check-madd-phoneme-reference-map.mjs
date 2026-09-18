import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../lib/burhan/phoneme-reference-map.ts", import.meta.url),
  "utf8",
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(compiled, "utf8").toString("base64");

const mapping = await import(moduleUrl);

const reference = {
  letter_phoneme_mappings: [
    {
      chars: "م",
      char_start: 7,
      char_end: 8,
      phonemes: ["m"],
      phoneme_start: 5,
      phoneme_end: 6,
    },
    {
      chars: "ٰ",
      char_start: 8,
      char_end: 8,
      phonemes: ["a:"],
      phoneme_start: 6,
      phoneme_end: 7,
    },
    {
      chars: "ن ",
      char_start: 11,
      char_end: 12,
      phonemes: ["n", "i"],
      phoneme_start: 7,
      phoneme_end: 9,
    },
  ],
};

const original = mapping.mapCharRangeToPhonemeSpan(reference, 7, 11);
assert.deepEqual(original, { start: 5, end: 6 });

const madd = mapping.mapMaddCharRangeToPhonemeSpan(reference, 7, 11);
assert.deepEqual(
  madd,
  { start: 6, end: 7 },
  "Madd mapping must select the zero-width long-vowel mark, not the carrier consonant",
);

const aridReference = {
  letter_phoneme_mappings: [
    {
      chars: "و",
      char_start: 247,
      char_end: 248,
      phonemes: ["u:"],
      phoneme_start: 153,
      phoneme_end: 154,
    },
    {
      chars: "ن",
      char_start: 248,
      char_end: 249,
      phonemes: ["n"],
      phoneme_start: 154,
      phoneme_end: 155,
    },
  ],
};

assert.deepEqual(
  mapping.mapMaddCharRangeToPhonemeSpan(aridReference, 247, 250),
  { start: 153, end: 154 },
);

const ambiguous = {
  letter_phoneme_mappings: [
    {
      chars: "ا",
      char_start: 10,
      char_end: 11,
      phonemes: ["a:"],
      phoneme_start: 7,
      phoneme_end: 8,
    },
    {
      chars: "ي",
      char_start: 12,
      char_end: 13,
      phonemes: ["i:"],
      phoneme_start: 8,
      phoneme_end: 9,
    },
  ],
};

assert.equal(
  mapping.mapMaddCharRangeToPhonemeSpan(ambiguous, 10, 13),
  null,
  "Ambiguous Madd ranges must not silently select an arbitrary long vowel",
);

console.log("madd phoneme reference mapping checks passed");
