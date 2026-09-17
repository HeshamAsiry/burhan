import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../lib/burhan/madd-detector.ts", import.meta.url),
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

const detector = await import(moduleUrl);

const samples = [
  ["natural", "قَالَ", "", "madd_asli"],
  ["badal", "ءَامَنَّا", "", "madd_badl"],
  ["badal-alif-maddah", "آمَنُوا", "", "madd_badl"],
  ["muttasil", "شَاءَ", "", "madd_muttasil"],
  ["munfasil", "بِمَآ", "أُنزِلَ", "madd_munfasil"],
  ["lazim-muthaqqal", "الضَّالِّينَ", "", "madd_lazim_kalimi_muthaqqal"],
  ["leen", "خَوْفٌ", "", "madd_leen"],
  ["iwad", "عَلِيمًا", "", "madd_iwad"],
];

for (const [name, word, nextWord, expectedRule] of samples) {
  const matches = detector.detectMaddOccurrences(word, 0, nextWord);
  assert.ok(
    matches.some((item) => item.ruleCode === expectedRule),
    name + ": expected " + expectedRule,
  );
}

const arid = detector.detectMaddOccurrences("عَلِيمٌ", 0, "");
assert.ok(
  arid.some((item) => item.ruleCode === "madd_arid_lissukun"),
  "arid li-sukun",
);

const iwad = detector.detectMaddOccurrences("عَلِيمًا", 0, "");
assert.ok(
  iwad.some((item) => item.ruleCode === "madd_iwad"),
  "iwad",
);
assert.ok(
  !iwad.some((item) => item.ruleCode === "madd_arid_lissukun"),
  "fathatan must not become arid li-sukun",
);

console.log("madd detector checks passed:", samples.length + 2);
