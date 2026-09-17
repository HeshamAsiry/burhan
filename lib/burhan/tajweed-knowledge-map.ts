import { detectMaddOccurrences } from "./madd-detector";

const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u;
const TANWEEN = new Set(["ً", "ٍ", "ٌ"]);
const SUN_LETTERS = new Set(["ت", "ث", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ل", "ن"]);
const MOON_LETTERS = new Set(["ا", "ب", "ج", "ح", "خ", "ع", "غ", "ف", "ق", "ك", "م", "ه", "و", "ي"]);
const IKHFA_LETTERS = new Set(["ت", "ث", "ج", "د", "ذ", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ف", "ق", "ك"]);
const IZHAR_LETTERS = new Set(["ء", "أ", "إ", "آ", "ٱ", "ه", "ع", "ح", "غ", "خ"]);
const IDGHAM_WITH_GHUNNAH_LETTERS = new Set(["ي", "ن", "م", "و"]);
const IDGHAM_WITHOUT_GHUNNAH_LETTERS = new Set(["ل", "ر"]);
const QALQALAH_LETTERS = new Set(["ق", "ط", "ب", "ج", "د"]);

export type TajweedOccurrenceSeed = {
  ruleCode: string;
  wordIndex: number;
  wordIndexEnd: number;
  charStart?: number;
  charEnd?: number;
  triggerText: string;
  contextText: string;
  expectedBehavior: Record<string, unknown>;
};

function stripMarks(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "")
    .replace(/ٱ/g, "ا")
    .trim();
}

function baseLetters(value: string) {
  return [...value].filter((character) => !ARABIC_MARKS.test(character) && character !== "ـ");
}

function firstBaseLetter(value: string) {
  return baseLetters(value)[0] ?? null;
}

function lastBaseLetter(value: string) {
  const letters = baseLetters(value);
  return letters.at(-1) ?? null;
}

function firstBaseLetterAfterArticle(value: string) {
  const letters = baseLetters(value);
  if (letters.length < 3 || letters[0] !== "ا" || letters[1] !== "ل") return null;
  return letters[2] ?? null;
}

function hasSukunAfter(value: string, letter: string) {
  return [...value].some((character, index, chars) => {
    if (character !== letter) return false;
    for (let i = index + 1; i < chars.length; i++) {
      if (ARABIC_MARKS.test(chars[i])) {
        return chars[i] === "ْ";
      }
      return false;
    }
    return false;
  });
}

function hasTanween(value: string) {
  return [...value].some((character) => TANWEEN.has(character));
}

function nextBaseLetterInWord(value: string, letterIndex: number) {
  const chars = [...value];
  for (let i = letterIndex + 1; i < chars.length; i++) {
    if (!ARABIC_MARKS.test(chars[i]) && chars[i] !== "ـ") return chars[i];
  }
  return null;
}

function classifyNoonOrTanween(following: string) {
  if (IZHAR_LETTERS.has(following)) return "noon_izhar";
  if (IDGHAM_WITH_GHUNNAH_LETTERS.has(following)) return "noon_idgham_ghunnah";
  if (IDGHAM_WITHOUT_GHUNNAH_LETTERS.has(following)) return "noon_idgham_without_ghunnah";
  if (following === "ب") return "noon_iqlab";
  if (IKHFA_LETTERS.has(following)) return "noon_ikhfa";
  return null;
}

function addOccurrence(
  output: TajweedOccurrenceSeed[],
  ruleCode: string,
  wordIndex: number,
  wordIndexEnd: number,
  triggerText: string,
  contextText: string,
  expectedBehavior: Record<string, unknown>,
) {
  output.push({
    ruleCode,
    wordIndex,
    wordIndexEnd,
    triggerText,
    contextText,
    expectedBehavior,
  });
}

export function extractDeterministicTajweedOccurrences(
  ayahText: string,
): TajweedOccurrenceSeed[] {
  const words = ayahText.split(/\s+/u).filter(Boolean);
  const occurrences: TajweedOccurrenceSeed[] = [];

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const nextWord = words[index + 1] ?? "";
    const nextLetter = firstBaseLetter(nextWord);
    const cleaned = stripMarks(word);
    const firstLetter = firstBaseLetter(word);
    const lastLetter = lastBaseLetter(word);

    if (cleaned.includes("الله")) {
      addOccurrence(
        occurrences,
        "lafz_al_jalalah_lam",
        index,
        index,
        word,
        word,
        { source: "lafz_al_jalalah", requires_acoustic_validation: true },
      );
    } else if (cleaned.startsWith("ال")) {
      const articleTarget = firstBaseLetterAfterArticle(word);
      if (articleTarget && SUN_LETTERS.has(articleTarget)) {
        addOccurrence(
          occurrences,
          "lam_shamsiyyah",
          index,
          index,
          word,
          word,
          { article: "al", following_letter: articleTarget, assimilation: true },
        );
      } else if (articleTarget && MOON_LETTERS.has(articleTarget)) {
        addOccurrence(
          occurrences,
          "lam_qamariyyah",
          index,
          index,
          word,
          word,
          { article: "al", following_letter: articleTarget, assimilation: false },
        );
      }
    }

    if (word.includes("نّ") || word.includes("مّ")) {
      addOccurrence(
        occurrences,
        "ghunnah_mushaddadah",
        index,
        index,
        word,
        word,
        { nasalization: true, duration_class: "ghunnah" },
      );
    }

    for (const letter of QALQALAH_LETTERS) {
      if (hasSukunAfter(word, letter)) {
        addOccurrence(
          occurrences,
          "qalqalah",
          index,
          index,
          letter,
          word,
          { letter, cause: "sukun_marked", requires_acoustic_validation: true },
        );
      }
    }

    if (lastLetter === "ن" && nextLetter) {
      const ruleCode = classifyNoonOrTanween(nextLetter);
      if (ruleCode) {
        addOccurrence(
          occurrences,
          ruleCode,
          index,
          index + 1,
          word,
          nextWord,
          { source: "noon_sakinah", following_letter: nextLetter },
        );
      }
    }

    if (hasTanween(word) && nextLetter) {
      const ruleCode = classifyNoonOrTanween(nextLetter);
      if (ruleCode) {
        addOccurrence(
          occurrences,
          ruleCode,
          index,
          index + 1,
          word,
          nextWord,
          { source: "tanween", following_letter: nextLetter },
        );
      }
    }

    const maddOccurrences = detectMaddOccurrences(word, index, nextWord);
    for (const madd of maddOccurrences) {
      occurrences.push({
        ruleCode: madd.ruleCode,
        wordIndex: madd.wordIndex,
        wordIndexEnd: madd.wordIndexEnd,
        charStart: madd.charStart,
        charEnd: madd.charEnd,
        triggerText: madd.triggerText,
        contextText: madd.contextText,
        expectedBehavior: madd.expectedBehavior,
      });
    }

    if (lastLetter === "م" && nextLetter) {
      const ruleCode =
        nextLetter === "م"
          ? "meem_idgham_shafawi"
          : nextLetter === "ب"
            ? "meem_ikhfa_shafawi"
            : "meem_izhar_shafawi";

      addOccurrence(
        occurrences,
        ruleCode,
        index,
        index + 1,
        word,
        nextWord,
        { source: "meem_sakinah", following_letter: nextLetter },
      );
    }
  }

  return occurrences;
}
