import type {
  QuranLetterPhonemeMapping,
  QuranPhonemeReference,
} from "./quran-phoneme-reference";

export type PhonemeSpan = {
  start: number;
  end: number;
};

function validMapping(mapping: QuranLetterPhonemeMapping) {
  return (
    Number.isInteger(mapping.char_start) &&
    Number.isInteger(mapping.char_end) &&
    Number.isInteger(mapping.phoneme_start) &&
    Number.isInteger(mapping.phoneme_end) &&
    mapping.phoneme_end > mapping.phoneme_start
  );
}

function charRangeMappings(
  mappings: QuranLetterPhonemeMapping[],
  charStart: number,
  charEnd: number,
) {
  return mappings.filter(
    (mapping) =>
      validMapping(mapping) &&
      mapping.char_end > charStart &&
      mapping.char_start < charEnd,
  );
}

/**
 * Maps a normal half-open character range to the phonemes whose character
 * spans overlap it. This intentionally excludes zero-width character spans.
 */
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
  const overlaps = charRangeMappings(mappings, charStart, charEnd);

  if (!overlaps.length) return null;

  const start = Math.min(...overlaps.map((mapping) => mapping.phoneme_start));
  const end = Math.max(...overlaps.map((mapping) => mapping.phoneme_end));

  return {
    start: phonemeOffset + start,
    end: phonemeOffset + end,
  };
}

/**
 * Resolves a Tajweed Madd occurrence to the long-vowel phoneme itself.
 *
 * Madd occurrence character ranges may include the carrier letter, Quranic
 * combining marks, and following context. Some reference mappings for
 * combining marks are zero-width (char_start === char_end), so ordinary
 * range-overlap cannot find them. We therefore select mappings whose
 * character start falls inside the occurrence and prefer phonemes containing
 * the long-vowel marker ":" (for example a:, i:, u:).
 *
 * The result is a single phoneme span whenever exactly one long-vowel
 * mapping is present. Returning null for ambiguous/missing mappings prevents
 * the acoustic layer from measuring an arbitrary neighboring phoneme.
 */
export function mapMaddCharRangeToPhonemeSpan(
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
  const candidates = mappings.filter(
    (mapping) =>
      validMapping(mapping) &&
      mapping.char_start >= charStart &&
      mapping.char_start < charEnd &&
      mapping.phonemes.some((phoneme) => phoneme.includes(":")),
  );

  if (candidates.length !== 1) return null;

  const mapping = candidates[0];

  return {
    start: phonemeOffset + mapping.phoneme_start,
    end: phonemeOffset + mapping.phoneme_end,
  };
}
