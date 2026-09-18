import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../lib/burhan/madd-phoneme-alignment.ts", import.meta.url),
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

const alignment = await import(moduleUrl);

const target = {
  occurrence_id: "madd-1",
  rule_code: "madd_asli",
  expected_harakah: [2],
  measurement_mode: "fixed_harakah",
  phoneme_start: 1,
  phoneme_end: 2,
};

const operations = [
  { type: "match", expected_index: 0, predicted_index: 0 },
  { type: "match", expected_index: 1, predicted_index: 1 },
  { type: "insertion", predicted_index: 2 },
  { type: "match", expected_index: 2, predicted_index: 3 },
];

const timings = [
  { index: 0, phoneme: "a", start_ms: 0, end_ms: 80 },
  { index: 1, phoneme: "aa", start_ms: 80, end_ms: 260, confidence: 0.95 },
  { index: 2, phoneme: "n", start_ms: 260, end_ms: 300, confidence: 0.7 },
  { index: 3, phoneme: "m", start_ms: 300, end_ms: 380, confidence: 0.9 },
];

const result = alignment.alignMaddTargetToPhonemeTimings({
  target,
  operations,
  timings,
});

assert.equal(result.status, "aligned");
assert.deepEqual(result.predicted_indices, [1]);
assert.equal(result.start_ms, 80);
assert.equal(result.end_ms, 260);
assert.equal(result.duration_ms, 180);
assert.equal(result.confidence, 0.95);

const derived = alignment.buildMaddTimingObservations({
  targets: [target],
  operations,
  timings,
  referenceHarakahMs: 90,
});

assert.equal(derived.observations.length, 1);
assert.equal(derived.observations[0].duration_ms, 180);
assert.equal(derived.observations[0].reference_harakah_ms, 90);
assert.equal(derived.observations[0].start_ms, 80);
assert.equal(derived.observations[0].end_ms, 260);

const missing = alignment.alignMaddTargetToPhonemeTimings({
  target: { ...target, phoneme_start: 5, phoneme_end: 6 },
  operations,
  timings,
});

assert.equal(missing.status, "not_aligned");
assert.equal(missing.duration_ms, null);

console.log("madd phoneme alignment checks passed");
