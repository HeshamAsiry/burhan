import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../lib/burhan/phoneme-provider-contract.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(compiled, "utf8").toString("base64");
const { parsePhonemeTimings } = await import(moduleUrl);

const phonemes = ["a", "b", "c"];

assert.deepEqual(
  parsePhonemeTimings(
    [
      { index: 0, phoneme: "a", start_ms: 0, end_ms: 100 },
      { index: 1, phoneme: "b", start_ms: 100, end_ms: 220 },
      { index: 2, phoneme: "c", start_ms: 220, end_ms: 340 },
    ],
    phonemes,
  ).map((x) => x.index),
  [0, 1, 2],
);

assert.throws(
  () =>
    parsePhonemeTimings(
      [
        { index: 0, phoneme: "a", start_ms: 0, end_ms: 100 },
        { index: 1, phoneme: "b", start_ms: 90, end_ms: 220 },
      ],
      phonemes,
    ),
  /overlap|bounds|timing/i,
);

assert.throws(
  () =>
    parsePhonemeTimings(
      [
        { index: 0, phoneme: "a", start_ms: 100, end_ms: 200 },
        { index: 1, phoneme: "b", start_ms: 50, end_ms: 90 },
      ],
      phonemes,
    ),
  /order|timing|bounds/i,
);

console.log("phoneme timing quality checks passed");
