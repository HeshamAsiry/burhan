const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u;
const SHADDAH = "ّ";
const SUKUN = "ْ";
const FATHA = "َ";
const DAMMA = "ُ";
const KASRA = "ِ";
const FATHATAN = "ً";
const HAMZA_BASES = new Set(["ء", "أ", "إ", "ؤ", "ئ", "آ"]);

type Unit = {
  base: string;
  marks: string[];
  start: number;
  end: number;
};

export type MaddOccurrence = {
  ruleCode:
    | "madd_asli"
    | "madd_badl"
    | "madd_muttasil"
    | "madd_munfasil"
    | "madd_lazim_kalimi_muthaqqal"
    | "madd_lazim_kalimi_mukhaffaf"
    | "madd_arid_lissukun"
    | "madd_leen"
    | "madd_iwad";
  wordIndex: number;
  wordIndexEnd: number;
  charStart: number;
  charEnd: number;
  triggerText: string;
  contextText: string;
  expectedBehavior: Record<string, unknown>;
};

function isMark(character: string) {
  return MARKS.test(character);
}

function parseUnits(word: string): Unit[] {
  const chars = [...word];
  const units: Unit[] = [];

  for (let index = 0; index < chars.length; index++) {
    const character = chars[index];

    if (isMark(character) || character === "ـ") {
      if (units.length) units[units.length - 1].marks.push(character);
      continue;
    }

    const unit: Unit = {
      base: character,
      marks: [],
      start: index,
      end: index + 1,
    };

    units.push(unit);
  }

  return units;
}

function hasMark(unit: Unit | undefined, mark: string) {
  return Boolean(unit?.marks.includes(mark));
}

function isAlifMadd(unit: Unit, previous: Unit | undefined) {
  return unit.base === "ا" && hasMark(previous, FATHA);
}

function isAlifMaqsurahMadd(unit: Unit, previous: Unit | undefined) {
  return unit.base === "ى" && hasMark(previous, FATHA);
}

function isWawMadd(unit: Unit, previous: Unit | undefined) {
  return unit.base === "و" && hasMark(previous, DAMMA);
}

function isYaMadd(unit: Unit, previous: Unit | undefined) {
  return unit.base === "ي" && hasMark(previous, KASRA);
}

function isDaggerAlifMadd(unit: Unit) {
  return unit.marks.includes("ٰ");
}

function isMaddLetter(unit: Unit, previous: Unit | undefined) {
  return (
    isAlifMadd(unit, previous) ||
    isAlifMaqsurahMadd(unit, previous) ||
    isWawMadd(unit, previous) ||
    isYaMadd(unit, previous) ||
    isDaggerAlifMadd(unit)
  );
}

function isHamzaUnit(unit: Unit | undefined) {
  return Boolean(unit && HAMZA_BASES.has(unit.base));
}

function nextMeaningfulUnit(units: Unit[], index: number) {
  return units[index + 1];
}

function buildOccurrence(
  word: string,
  nextWord: string,
  wordIndex: number,
  unit: Unit,
  nextUnit: Unit | undefined,
  ruleCode: MaddOccurrence["ruleCode"],
  expectedBehavior: Record<string, unknown>,
): MaddOccurrence {
  const contextText = nextWord ? word + " " + nextWord : word;
  const triggerText = nextWord && nextUnit
    ? word.slice(unit.start) + " " + nextWord.slice(0, nextUnit.end)
    : word.slice(unit.start, unit.end);

  return {
    ruleCode,
    wordIndex,
    wordIndexEnd: nextWord ? wordIndex + 1 : wordIndex,
    charStart: unit.start,
    charEnd: nextUnit ? nextUnit.end : unit.end,
    triggerText,
    contextText,
    expectedBehavior,
  };
}

export function detectMaddOccurrences(
  word: string,
  wordIndex: number,
  nextWord?: string,
): MaddOccurrence[] {
  const next = nextWord ?? "";
  const units = parseUnits(word);
  const nextUnits = parseUnits(next);
  const occurrences: MaddOccurrence[] = [];

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const previous = units[i - 1];
    const following = nextMeaningfulUnit(units, i);

    if (unit.base === "آ") {
      occurrences.push(
        buildOccurrence(
          word,
          next,
          wordIndex,
          unit,
          undefined,
          "madd_badl",
          {
            cause: "preceding_hamza_embedded_in_alif_maddah",
            reference_duration: "route_profile",
          },
        ),
      );
      continue;
    }

    if (!isMaddLetter(unit, previous)) continue;

    if (following && isHamzaUnit(following)) {
      occurrences.push(
        buildOccurrence(
          word,
          next,
          wordIndex,
          unit,
          following,
          "madd_muttasil",
          {
            cause: "hamza_same_word",
            reference_duration: "route_profile",
          },
        ),
      );
      continue;
    }

    if (!following && nextUnits.length && isHamzaUnit(nextUnits[0])) {
      occurrences.push(
        buildOccurrence(
          word,
          next,
          wordIndex,
          unit,
          nextUnits[0],
          "madd_munfasil",
          {
            cause: "hamza_next_word",
            reference_duration: "route_profile",
          },
        ),
      );
      continue;
    }

    if (following && hasMark(following, SHADDAH)) {
      occurrences.push(
        buildOccurrence(
          word,
          next,
          wordIndex,
          unit,
          following,
          "madd_lazim_kalimi_muthaqqal",
          {
            cause: "original_sukun_with_shaddah",
            reference_duration: "6_harakah",
            requires_acoustic_validation: true,
          },
        ),
      );
      continue;
    }

    if (following && hasMark(following, SUKUN)) {
      occurrences.push(
        buildOccurrence(
          word,
          next,
          wordIndex,
          unit,
          following,
          "madd_lazim_kalimi_mukhaffaf",
          {
            cause: "original_sukun",
            reference_duration: "6_harakah",
            requires_acoustic_validation: true,
          },
        ),
      );
      continue;
    }

    if (i === units.length - 2) {
      const finalUnit = units.at(-1);
      if (finalUnit && !hasMark(finalUnit, SUKUN) && finalUnit.marks.some(
        (mark) => mark === FATHA || mark === DAMMA || mark === KASRA
      )) {
        occurrences.push(
          buildOccurrence(
            word,
            next,
            wordIndex,
            unit,
            finalUnit,
            "madd_arid_lissukun",
            {
              condition: "waqf",
              allowed_duration: "route_profile",
              requires_acoustic_validation: true,
            },
          ),
        );
      }
    }

    occurrences.push(
      buildOccurrence(
        word,
        next,
        wordIndex,
        unit,
        following,
        "madd_asli",
        {
          cause: "no_secondary_cause_detected",
          reference_duration: "2_harakah",
          requires_acoustic_validation: true,
        },
      ),
    );
  }

  const finalUnit = units.at(-1);
  if (finalUnit?.marks.includes(FATHATAN) && finalUnit.base !== "ة") {
    occurrences.push({
      ruleCode: "madd_iwad",
      wordIndex,
      wordIndexEnd: wordIndex,
      charStart: finalUnit.start,
      charEnd: finalUnit.end,
      triggerText: word.slice(finalUnit.start, finalUnit.end),
      contextText: word,
      expectedBehavior: {
        condition: "waqf",
        reference_duration: "2_harakah",
        excluded_final_letter: "ta_marbuta",
      },
    });
  }

  if (
    finalUnit &&
    units.length >= 2 &&
    (finalUnit.base !== "ا" && finalUnit.base !== "ى") &&
    hasMark(finalUnit, FATHA)
  ) {
    const leanUnit = units.at(-2);
    const leanPrevious = units.at(-3);
    if (
      leanUnit &&
      leanUnit.base === "و" &&
      hasMark(leanUnit, SUKUN) &&
      hasMark(leanPrevious, FATHA)
    ) {
      occurrences.push({
        ruleCode: "madd_leen",
        wordIndex,
        wordIndexEnd: wordIndex,
        charStart: leanUnit.start,
        charEnd: leanUnit.end,
        triggerText: word.slice(leanUnit.start, leanUnit.end),
        contextText: word,
        expectedBehavior: {
          condition: "waqf",
          reference_duration: "route_profile",
          requires_acoustic_validation: true,
        },
      });
    }

    if (
      leanUnit &&
      leanUnit.base === "ي" &&
      hasMark(leanUnit, SUKUN) &&
      hasMark(leanPrevious, FATHA)
    ) {
      occurrences.push({
        ruleCode: "madd_leen",
        wordIndex,
        wordIndexEnd: wordIndex,
        charStart: leanUnit.start,
        charEnd: leanUnit.end,
        triggerText: word.slice(leanUnit.start, leanUnit.end),
        contextText: word,
        expectedBehavior: {
          condition: "waqf",
          reference_duration: "route_profile",
          requires_acoustic_validation: true,
        },
      });
    }
  }

  return occurrences;
}
