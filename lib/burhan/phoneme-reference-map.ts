import type {
  QuranLetterPhonemeMapping,
  QuranPhonemeReference,
} from "./quran-phoneme-reference";

export type PhonemeSpan = {
  start: number;
  end: number;
};

export function mapCharRangeToPhonemeSpan(
  reference: Pick<QuranPhonemeReference, "letter_phoneme_mappings">,
  charStart: number,
  charEnd: number,
  phonemeOffset = 0,
): PhonemeSpan | null {
  if (
    !Number.isInteger(charStart) ||
    !Number.isInteger(charEnd) ||
    charStart < 0 ||
    charEnd <= charStart
  ) {
    return null;
  }

  const mappings = reference.letter_phoneme_mappings as QuranLetterPhonemeMapping[];
  const overlaps = mappings.filter(
    (mapping) =>
      Number.isInteger(mapping.char_start) &&
      Number.isInteger(mapping.char_end) &&
      mapping.char_end > charStart &&
      mapping.char_start < charEnd &&
      Number.isInteger(mapping.phoneme_start) &&
      Number.isInteger(mapping.phoneme_end) &&
      mapping.phoneme_end > mapping.phoneme_start,
  );

  if (!overlaps.length) return null;

  const start = Math.min(...overlaps.map((mapping) => mapping.phoneme_start));
  const end = Math.max(...overlaps.map((mapping) => mapping.phoneme_end));

  return {
    start: phonemeOffset + start,
    end: phonemeOffset + end,
  };
}
