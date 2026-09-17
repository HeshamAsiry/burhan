import assert from "node:assert/strict";

const samples = [
  {
    name: "natural",
    word: "قَالَ",
    next: "",
    expected: "madd_asli",
  },
  {
    name: "badal",
    word: "ءَامَنَّا",
    next: "",
    expected: "madd_badl",
  },
  {
    name: "muttasil",
    word: "شَاءَ",
    next: "",
    expected: "madd_muttasil",
  },
  {
    name: "munfasil",
    word: "بِمَا",
    next: "أُنزِلَ",
    expected: "madd_munfasil",
  },
  {
    name: "lazim muthaqqal",
    word: "الضَّالِّينَ",
    next: "",
    expected: "madd_lazim_kalimi_muthaqqal",
  },
  {
    name: "leen",
    word: "خَوْفْ",
    next: "",
    expected: "madd_leen",
  },
  {
    name: "iwad",
    word: "عَلِيمًا",
    next: "",
    expected: "madd_iwad",
  },
];

const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u;
const units = (word) => {
  const chars = [...word];
  const result = [];
  for (const char of chars) {
    if (MARKS.test(char) || char === "ـ") {
      result.at(-1)?.marks.push(char);
    } else {
      result.push({ base: char, marks: [] });
    }
  }
  return result;
};

for (const sample of samples) {
  const parsed = units(sample.word);
  assert.ok(parsed.length > 0, sample.name);
}

console.log("madd detector smoke samples parsed:", samples.length);
