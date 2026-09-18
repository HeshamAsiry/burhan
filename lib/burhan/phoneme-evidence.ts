import type {
  QuranLetterPhonemeMapping,
} from "./quran-phoneme-reference";
import type { PhonemeOperation } from "./phoneme-evaluator";

export type PhonemeReferenceSegment = {
  ayah_id: string;
  surah_id: number;
  ayah_number: number;
  text_ar?: string | null;
  phoneme_offset: number;
  phonemes: string[];
  letter_phoneme_mappings: QuranLetterPhonemeMapping[];
};

export type TajweedOccurrenceContext = {
  occurrence_id: string;
  ayah_id: string;
  rule_code: string;
  char_start?: number | null;
  char_end?: number | null;
  word_index?: number | null;
  word_index_end?: number | null;
};

export type PhonemeErrorEvidence = {
  type: "phoneme_error";
  operation_type: "substitution" | "deletion" | "insertion";
  expected?: string;
  predicted?: string;
  expected_index?: number;
  predicted_index?: number;
  ayah_id?: string;
  surah_id?: number;
  ayah_number?: number;
  char_start?: number;
  char_end?: number;
  chars?: string;
  tajweed_occurrence_ids?: string[];
  tajweed_rule_codes?: string[];
};

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number | null | undefined,
  rightEnd: number | null | undefined,
) {
  return (
    Number.isInteger(rightStart) &&
    Number.isInteger(rightEnd) &&
    Number(rightEnd) > leftStart &&
    Number(rightStart) < leftEnd
  );
}

function findSegment(
  index: number,
  segments: PhonemeReferenceSegment[],
) {
  return segments.find(
    (segment) =>
      index >= segment.phoneme_offset &&
      index < segment.phoneme_offset + segment.phonemes.length,
  );
}

function findLetterMapping(
  localIndex: number,
  mappings: QuranLetterPhonemeMapping[],
) {
  return mappings.find(
    (mapping) =>
      localIndex >= mapping.phoneme_start &&
      localIndex < mapping.phoneme_end,
  );
}

function normalizeOperationType(
  operation: PhonemeOperation,
): PhonemeErrorEvidence["operation_type"] | null {
  return operation.type === "match" ? null : operation.type;
}

export function buildPhonemeErrorEvidence(input: {
  operations: PhonemeOperation[];
  segments: PhonemeReferenceSegment[];
  tajweedOccurrences?: TajweedOccurrenceContext[];
}): PhonemeErrorEvidence[] {
  const occurrences = input.tajweedOccurrences ?? [];

  return input.operations.flatMap((operation) => {
    const operationType = normalizeOperationType(operation);
    if (!operationType) return [];

    const expectedIndex =
      typeof operation.expected_index === "number"
        ? operation.expected_index
        : null;

    const segment =
      expectedIndex == null
        ? undefined
        : findSegment(expectedIndex, input.segments);

    const localIndex =
      segment && expectedIndex != null
        ? expectedIndex - segment.phoneme_offset
        : null;

    const letterMapping =
      segment && localIndex != null
        ? findLetterMapping(localIndex, segment.letter_phoneme_mappings)
        : undefined;

    const relatedOccurrences =
      segment && letterMapping
        ? occurrences.filter(
            (occurrence) =>
              occurrence.ayah_id === segment.ayah_id &&
              overlaps(
                letterMapping.char_start,
                letterMapping.char_end,
                occurrence.char_start,
                occurrence.char_end,
              ),
          )
        : [];

    const evidence: PhonemeErrorEvidence = {
      type: "phoneme_error",
      operation_type: operationType,
      expected: operation.expected,
      predicted: operation.predicted,
      expected_index: operation.expected_index,
      predicted_index: operation.predicted_index,
    };

    if (segment) {
      evidence.ayah_id = segment.ayah_id;
      evidence.surah_id = segment.surah_id;
      evidence.ayah_number = segment.ayah_number;
    }

    if (letterMapping) {
      evidence.char_start = letterMapping.char_start;
      evidence.char_end = letterMapping.char_end;
      evidence.chars = letterMapping.chars;
    }

    if (relatedOccurrences.length) {
      evidence.tajweed_occurrence_ids = relatedOccurrences.map(
        (occurrence) => occurrence.occurrence_id,
      );
      evidence.tajweed_rule_codes = [
        ...new Set(
          relatedOccurrences.map((occurrence) => occurrence.rule_code),
        ),
      ];
    }

    return [evidence];
  });
}

export function summarizePhonemeErrorsByAyah(
  evidence: PhonemeErrorEvidence[],
) {
  const byAyah = new Map<
    string,
    {
      ayah_id: string;
      surah_id: number;
      ayah_number: number;
      errors: number;
      substitutions: number;
      deletions: number;
      insertions: number;
      evidence_count: number;
      tajweed_rule_codes: string[];
    }
  >();

  for (const item of evidence) {
    if (!item.ayah_id || item.surah_id == null || item.ayah_number == null) {
      continue;
    }

    const current = byAyah.get(item.ayah_id) ?? {
      ayah_id: item.ayah_id,
      surah_id: item.surah_id,
      ayah_number: item.ayah_number,
      errors: 0,
      substitutions: 0,
      deletions: 0,
      insertions: 0,
      evidence_count: 0,
      tajweed_rule_codes: [],
    };

    current.errors += 1;
    current.evidence_count += 1;

    if (item.operation_type === "substitution") current.substitutions += 1;
    if (item.operation_type === "deletion") current.deletions += 1;
    if (item.operation_type === "insertion") current.insertions += 1;

    current.tajweed_rule_codes = [
      ...new Set([
        ...current.tajweed_rule_codes,
        ...(item.tajweed_rule_codes ?? []),
      ]),
    ];

    byAyah.set(item.ayah_id, current);
  }

  return [...byAyah.values()].sort(
    (a, b) => a.surah_id - b.surah_id || a.ayah_number - b.ayah_number,
  );
}

export function buildPhonemeReferenceSegments(input: {
  orderedAyahs: Array<{
    id: string;
    surah_id: number;
    ayah_number: number;
  }>;
  referenceByAyah: Map<
    string,
    Pick<
      {
        phonemes: string[];
        letter_phoneme_mappings: QuranLetterPhonemeMapping[];
      },
      "phonemes" | "letter_phoneme_mappings"
    >
  >;
}): PhonemeReferenceSegment[] {
  let offset = 0;

  return input.orderedAyahs.flatMap((ayah) => {
    const reference = input.referenceByAyah.get(ayah.id);
    if (!reference?.phonemes.length) return [];

    const segment: PhonemeReferenceSegment = {
      ayah_id: ayah.id,
      surah_id: ayah.surah_id,
      ayah_number: ayah.ayah_number,
      phoneme_offset: offset,
      phonemes: reference.phonemes,
      letter_phoneme_mappings: reference.letter_phoneme_mappings,
    };

    offset += reference.phonemes.length;
    return [segment];
  });
}
