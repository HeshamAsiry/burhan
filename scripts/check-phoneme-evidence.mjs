import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../lib/burhan/phoneme-evidence.ts", import.meta.url),
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

const evidence = await import(moduleUrl);

const segments = [
  {
    ayah_id: "ayah-1",
    surah_id: 1,
    ayah_number: 1,
    phoneme_offset: 0,
    phonemes: ["b", "i", "s", "m", "i"],
    letter_phoneme_mappings: [
      {
        chars: "ب",
        phonemes: ["b", "i"],
        char_start: 0,
        char_end: 1,
        phoneme_start: 0,
        phoneme_end: 2,
      },
      {
        chars: "س",
        phonemes: ["s"],
        char_start: 3,
        char_end: 4,
        phoneme_start: 2,
        phoneme_end: 3,
      },
    ],
  },
  {
    ayah_id: "ayah-2",
    surah_id: 2,
    ayah_number: 1,
    phoneme_offset: 5,
    phonemes: ["l", "a", "m"],
    letter_phoneme_mappings: [
      {
        chars: "الٓمٓ",
        phonemes: ["l", "a", "m"],
        char_start: 0,
        char_end: 5,
        phoneme_start: 0,
        phoneme_end: 3,
      },
    ],
  },
];

const operations = [
  {
    type: "substitution",
    expected: "s",
    predicted: "ṣ",
    expected_index: 2,
    predicted_index: 2,
  },
  {
    type: "deletion",
    expected: "m",
    expected_index: 3,
  },
];

const errorEvidence = evidence.buildPhonemeErrorEvidence({
  operations,
  segments,
  tajweedOccurrences: [
    {
      occurrence_id: "occ-1",
      ayah_id: "ayah-1",
      rule_code: "madd_asli",
      char_start: 3,
      char_end: 4,
    },
  ],
});

assert.equal(errorEvidence.length, 2);
assert.equal(errorEvidence[0].ayah_id, "ayah-1");
assert.equal(errorEvidence[0].chars, "س");
assert.deepEqual(errorEvidence[0].tajweed_rule_codes, ["madd_asli"]);
assert.equal(errorEvidence[1].ayah_id, "ayah-1");

const summaries = evidence.summarizePhonemeErrorsByAyah(errorEvidence);
assert.equal(summaries.length, 1);
assert.equal(summaries[0].errors, 2);
assert.equal(summaries[0].substitutions, 1);
assert.equal(summaries[0].deletions, 1);
assert.deepEqual(summaries[0].tajweed_rule_codes, ["madd_asli"]);

console.log("phoneme evidence checks passed");
