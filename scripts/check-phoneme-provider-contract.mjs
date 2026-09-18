import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../lib/burhan/phoneme-provider-contract.ts", import.meta.url),
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

const contract = await import(moduleUrl);
const parsePhonemeTimings = contract.parsePhonemeTimings;

const phonemes = ["b", "i", "s"];

const parsed = parsePhonemeTimings(
  [
    { index: 2, phoneme: "s", start_ms: 210, end_ms: 330, confidence: 0.93 },
    { index: 0, phoneme: "b", start_ms: 0, end_ms: 90 },
  ],
  phonemes,
);

assert.deepEqual(parsed.map((item) => item.index), [0, 2]);
assert.equal(parsed[1].phoneme, "s");
assert.equal(parsed[1].end_ms, 330);
assert.equal(parsed[1].confidence, 0.93);

assert.deepEqual(parsePhonemeTimings(undefined, phonemes), []);

assert.throws(
  () =>
    parsePhonemeTimings(
      [{ index: 0, phoneme: "x", start_ms: 0, end_ms: 10 }],
      phonemes,
    ),
  /does not match/,
);

assert.throws(
  () =>
    parsePhonemeTimings(
      [
        { index: 0, phoneme: "b", start_ms: 0, end_ms: 10 },
        { index: 0, phoneme: "b", start_ms: 10, end_ms: 20 },
      ],
      phonemes,
    ),
  /duplicate/,
);

assert.throws(
  () =>
    parsePhonemeTimings(
      [{ index: 1, phoneme: "i", start_ms: 50, end_ms: 50 }],
      phonemes,
    ),
  /bounds/,
);

console.log("phoneme provider contract checks passed");
