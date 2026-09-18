import { getSupabaseAdmin } from "../supabase-admin";

export type QuranLetterPhonemeMapping = {
  chars: string;
  phonemes: string[];
  char_start: number;
  char_end: number;
  phoneme_start: number;
  phoneme_end: number;
};

export type QuranTajweedMappingEntry = {
  char: string;
  char_start: number;
  char_end: number;
  source_rules: string[];
  target_rules: string[];
};

export type QuranTajweedMapping = {
  location: string;
  entries: QuranTajweedMappingEntry[];
};

export type QuranPhonemeReference = {
  ayah_id: string;
  phonemes: string[];
  phoneme_version: string;
  source: string;
  letter_phoneme_mappings: QuranLetterPhonemeMapping[];
  tajweed_mappings: QuranTajweedMapping[];
};

function normalizeReferenceRow(row: Record<string, unknown>): QuranPhonemeReference {
  if (typeof row.ayah_id !== "string") {
    throw new Error("Quran phoneme reference has an invalid ayah_id.");
  }

  if (!Array.isArray(row.phonemes) || row.phonemes.length === 0) {
    throw new Error("Quran phoneme reference has no phonemes.");
  }

  if (typeof row.phoneme_version !== "string" || !row.phoneme_version.trim()) {
    throw new Error("Quran phoneme reference has no phoneme version.");
  }

  if (typeof row.source !== "string" || !row.source.trim()) {
    throw new Error("Quran phoneme reference has no source.");
  }

  const letterMappings = Array.isArray(row.letter_phoneme_mappings)
    ? row.letter_phoneme_mappings
    : [];
  const tajweedMappings = Array.isArray(row.tajweed_mappings)
    ? row.tajweed_mappings
    : [];

  return {
    ayah_id: row.ayah_id,
    phonemes: row.phonemes.map((value) => String(value)).filter(Boolean),
    phoneme_version: row.phoneme_version.trim(),
    source: row.source.trim(),
    letter_phoneme_mappings: letterMappings as QuranLetterPhonemeMapping[],
    tajweed_mappings: tajweedMappings as QuranTajweedMapping[],
  };
}

export async function getQuranPhonemeReferences(input: {
  ayahIds: string[];
}): Promise<QuranPhonemeReference[]> {
  const ayahIds = [...new Set(input.ayahIds)].filter(Boolean);

  if (!ayahIds.length) return [];

  if (ayahIds.length > 500) {
    throw new Error("Too many ayah ids requested for phoneme references.");
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("quran_phoneme_references")
    .select(
      "ayah_id,phoneme_version,phonemes,source,letter_phoneme_mappings,tajweed_mappings",
    )
    .in("ayah_id", ayahIds);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) =>
    normalizeReferenceRow(row as Record<string, unknown>),
  );
}

export async function getQuranPhonemeReference(input: {
  ayahId: string;
}): Promise<QuranPhonemeReference | null> {
  const references = await getQuranPhonemeReferences({
    ayahIds: [input.ayahId],
  });

  return references[0] ?? null;
}

// Kept as an explicit runtime guard for old callers. Reference generation is
// build-time only; there is intentionally no external phonemizer HTTP call.
export async function phonemizeQuranAyah(input: {
  ayahId: string;
}): Promise<QuranPhonemeReference> {
  const reference = await getQuranPhonemeReference(input);

  if (!reference) {
    throw new Error(
      "Quran phoneme reference is not ready for ayah " + input.ayahId,
    );
  }

  return reference;
}
