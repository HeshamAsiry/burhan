export type CanonicalPhoneme =
  | "<"
  | "a"
  | "u"
  | "i"
  | "A"
  | "U"
  | "I"
  | "aa"
  | "uu"
  | "ii"
  | "AA"
  | "UU"
  | "II"
  | "b" | "bb"
  | "t" | "tt"
  | "^" | "^^"
  | "j" | "jj"
  | "H" | "HH"
  | "x" | "xx"
  | "d" | "dd"
  | "*" | "**"
  | "r" | "rr"
  | "z" | "zz"
  | "s" | "ss"
  | "$" | "$$"
  | "S" | "SS"
  | "D" | "DD"
  | "T" | "TT"
  | "Z" | "ZZ"
  | "E" | "EE"
  | "g" | "gg"
  | "f" | "ff"
  | "q" | "qq"
  | "k" | "kk"
  | "l" | "ll"
  | "m" | "mm"
  | "n" | "nn"
  | "h" | "hh"
  | "w" | "ww"
  | "y" | "yy";

const BURHAN_TO_NAWAR: Record<string, CanonicalPhoneme> = {
  "ʔ": "<",
  "a": "a",
  "u": "u",
  "i": "i",
  "aˤ": "A",
  "uˤ": "U",
  "iˤ": "I",
  "a:": "aa",
  "u:": "uu",
  "i:": "ii",
  "aˤ:": "AA",
  "uˤ:": "UU",
  "iˤ:": "II",
  "b": "b",
  "bb": "bb",
  "t": "t",
  "tt": "tt",
  "θ": "^",
  "θθ": "^^",
  "ð": "*",
  "ðð": "**",
  "ʒ": "j",
  "ʒʒ": "jj",
  "ħ": "H",
  "ħħ": "HH",
  "χ": "x",
  "χχ": "xx",
  "d": "d",
  "dd": "dd",
  "r": "r",
  "rˤ": "r",
  "rr": "rr",
  "rˤrˤ": "rr",
  "z": "z",
  "zz": "zz",
  "s": "s",
  "ss": "ss",
  "ʃ": "$",
  "ʃʃ": "$$",
  "sˤ": "S",
  "sˤsˤ": "SS",
  "dˤ": "D",
  "dˤdˤ": "DD",
  "tˤ": "T",
  "tˤtˤ": "TT",
  "zˤ": "Z",
  "zˤzˤ": "ZZ",
  "ʕ": "E",
  "ʕʕ": "EE",
  "ɣ": "g",
  "ɣɣ": "gg",
  "f": "f",
  "ff": "ff",
  "q": "q",
  "qq": "qq",
  "k": "k",
  "kk": "kk",
  "l": "l",
  "ll": "ll",
  "m": "m",
  "mm": "mm",
  "n": "n",
  "nn": "nn",
  "h": "h",
  "hh": "hh",
  "w": "w",
  "ww": "ww",
  "j": "j",
  "jj": "jj",
  "y": "y",
  "yy": "yy",
};

export function canonicalizePhoneme(value: string): CanonicalPhoneme | null {
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const direct = BURHAN_TO_NAWAR[trimmed];
  if (direct) return direct;

  const nawarValues = new Set(Object.values(BURHAN_TO_NAWAR) as string[]);
  if (nawarValues.has(trimmed)) {
    return trimmed as CanonicalPhoneme;
  }

  return null;
}

export function canonicalizePhonemeSequence(values: string[]) {
  return values.flatMap((value) => {
    const canonical = canonicalizePhoneme(value);
    return canonical ? [canonical] : [];
  });
}

export function countUnknownPhonemes(values: string[]) {
  return values.reduce((count, value) =>
    canonicalizePhoneme(value) ? count : count + 1,
  0);
}
