import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";

export type AnchorRecallInput = {
  anchor: string;
  occurrencesRequired: number | "all";
  ayahsAfter: number;
  juz?: number;
};

type AyahRow = {
  id: string;
  surah_id: number;
  ayah_number: number;
  text_ar: string;
  normalized_text: string;
  juz_number: number;
};

function findOccurrences(text: string, anchor: string) {
  const results: Array<{ start: number; end: number }> = [];
  let from = 0;

  while (from < text.length) {
    const index = text.indexOf(anchor, from);
    if (index === -1) break;
    results.push({ start: index, end: index + anchor.length });
    from = index + Math.max(anchor.length, 1);
  }

  return results;
}

export async function findAnchorRecall(input: AnchorRecallInput) {
  const db = getSupabaseAdmin();
  const normalizedAnchor = normalizeArabic(input.anchor);

  if (!normalizedAnchor) {
    throw new Error("Anchor becomes empty after normalization.");
  }

  // Search only candidate ayahs instead of loading the entire Quran.
  // The substring search is intentional: anchors such as "اقترب" should
  // also match forms like "واقْتَرَبَ" after normalization.
  const { data: candidates, error: candidateError } = await db
    .from("ayahs")
    .select("id,surah_id,ayah_number,text_ar,normalized_text,juz_number")
    .ilike("normalized_text", `%${normalizedAnchor}%`)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });

  if (candidateError) throw new Error(candidateError.message);

  const candidateAyahs = ((candidates ?? []) as AyahRow[]).filter(
    (ayah) => !input.juz || ayah.juz_number === input.juz,
  );

  const matches = candidateAyahs.flatMap((ayah) =>
    findOccurrences(ayah.normalized_text ?? "", normalizedAnchor).map((position) => ({
      ayah,
      normalizedStart: position.start,
      normalizedEnd: position.end,
    })),
  );

  const selected =
    input.occurrencesRequired === "all"
      ? matches
      : matches.slice(0, input.occurrencesRequired);

  // Fetch the surrounding ayahs separately so a requested passage can cross
  // a juz boundary without being truncated by the optional juz filter.
  const surahIds = [...new Set(selected.map((match) => match.ayah.surah_id))];
  const ayahByKey = new Map<string, AyahRow>();

  if (surahIds.length > 0) {
    const { data: surroundingAyahs, error: surroundingError } = await db
      .from("ayahs")
      .select("id,surah_id,ayah_number,text_ar,normalized_text,juz_number")
      .in("surah_id", surahIds)
      .order("surah_id", { ascending: true })
      .order("ayah_number", { ascending: true });

    if (surroundingError) throw new Error(surroundingError.message);

    for (const ayah of (surroundingAyahs ?? []) as AyahRow[]) {
      ayahByKey.set(`${ayah.surah_id}:${ayah.ayah_number}`, ayah);
    }
  }

  const occurrenceResults = selected.map((match) => {
    const following = Array.from({ length: input.ayahsAfter + 1 }, (_, offset) =>
      ayahByKey.get(`${match.ayah.surah_id}:${match.ayah.ayah_number + offset}`),
    ).filter(Boolean);

    return {
      surah_id: match.ayah.surah_id,
      ayah_number: match.ayah.ayah_number,
      normalized_anchor_start: match.normalizedStart,
      normalized_anchor_end: match.normalizedEnd,
      ayahs: following,
    };
  });

  return {
    anchor: input.anchor,
    normalized_anchor: normalizedAnchor,
    occurrences_found: matches.length,
    occurrences_returned: occurrenceResults.length,
    occurrences: occurrenceResults,
  };
}
