import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../lib/burhan/teacher-review.ts", import.meta.url),
  "utf8",
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "burhan-review-"));
const modulePath = path.join(tempDir, "teacher-review.cjs");
fs.writeFileSync(modulePath, transpiled);

const mod = await import(modulePath);

const verified = mod.decideTeacherReview({
  confidence: 0.95,
  issueDetected: false,
  audioQuality: "good",
  unresolvedItems: 0,
});
if (verified.verdictStatus !== "verified") throw new Error("verified case failed");

const issue = mod.decideTeacherReview({
  confidence: 0.95,
  issueDetected: true,
  audioQuality: "good",
  unresolvedItems: 0,
});
if (issue.verdictStatus !== "detected_issue") throw new Error("issue case failed");

const review = mod.decideTeacherReview({
  confidence: 0.95,
  issueDetected: false,
  audioQuality: "unclear",
  unresolvedItems: 0,
});
if (!review.requiresTeacherReview || !review.reasons.includes("audio_quality_unclear")) {
  throw new Error("audio review case failed");
}

const unresolved = mod.decideTeacherReview({
  confidence: 0.95,
  issueDetected: false,
  audioQuality: "good",
  unresolvedItems: 1,
});
if (!unresolved.requiresTeacherReview || !unresolved.reasons.includes("unresolved_signals")) {
  throw new Error("unresolved review case failed");
}

console.log("teacher review acceptance checks passed");
