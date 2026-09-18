import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync("lib/burhan/madd-acoustic-evaluator.ts", "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const module = { exports: {} };
new Function("require", "module", "exports", transpiled)(require, module, module.exports);
const { evaluateMaddObservation, evaluateMaddObservations, summarizeMaddMeasurements } = module.exports;

const target = {
  occurrence_id: "madd-1",
  rule_code: "madd_tabii",
  expected_harakah: [2],
  measurement_mode: "fixed_harakah",
};

const verified = evaluateMaddObservation(target, {
  occurrence_id: "madd-1",
  duration_ms: 180,
  reference_harakah_ms: 90,
  confidence: 0.96,
});
if (verified.status !== "verified" || verified.estimated_harakah !== 2) {
  throw new Error("Expected a high-confidence 2-harakah measurement to verify.");
}

const short = evaluateMaddObservation(target, {
  occurrence_id: "madd-1",
  duration_ms: 90,
  reference_harakah_ms: 90,
  confidence: 0.99,
});
if (short.status !== "detected_issue" || short.estimated_harakah !== 1) {
  throw new Error("Expected a high-confidence short Madd to be detected as an issue.");
}

const uncertain = evaluateMaddObservation(target, {
  occurrence_id: "madd-1",
  duration_ms: 90,
  reference_harakah_ms: 90,
  confidence: 0.75,
});
if (uncertain.status !== "needs_teacher_review") {
  throw new Error("Expected low-confidence Madd evidence to require teacher review.");
}

const missingReference = evaluateMaddObservation(target, {
  occurrence_id: "madd-1",
  duration_ms: 180,
  confidence: 0.99,
});
if (
  missingReference.status !== "not_assessed" ||
  !missingReference.reasons.includes("missing_harakah_reference")
) {
  throw new Error("Expected missing calibration to prevent automated Madd assessment.");
}

const waqfTarget = {
  ...target,
  occurrence_id: "madd-waqf",
  condition: "waqf",
  requires_stop: true,
};
const noStop = evaluateMaddObservation(waqfTarget, {
  occurrence_id: "madd-waqf",
  duration_ms: 180,
  reference_harakah_ms: 90,
  confidence: 0.99,
  stop_detected: false,
});
if (
  noStop.status !== "not_assessed" ||
  !noStop.reasons.includes("waqf_required")
) {
  throw new Error("Expected a waqf-dependent Madd without stop detection to remain unassessed.");
}

const summary = summarizeMaddMeasurements(
  evaluateMaddObservations(
    [target, { ...target, occurrence_id: "madd-2" }],
    [
      {
        occurrence_id: "madd-1",
        duration_ms: 180,
        reference_harakah_ms: 90,
        confidence: 0.96,
      },
      {
        occurrence_id: "madd-2",
        duration_ms: 90,
        reference_harakah_ms: 90,
        confidence: 0.99,
      },
    ],
  ),
);
if (summary.total !== 2 || summary.verified !== 1 || summary.detected_issues !== 1) {
  throw new Error("Unexpected Madd summary counts.");
}

console.log("madd evaluator acceptance checks passed");
