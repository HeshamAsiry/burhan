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

type AnchorMatch = AyahRow & {
  anchor_start: number;
  anchor_end: number;
};

export async function findAnchorRecall(input: AnchorRecallInput) {
  const db = getSupabaseAdmin();
  const normalizedAnchor = normalizeArabic(input.anchor);

  if (!normalizedAnchor) {
    throw new Error("Anchor becomes empty after normalization.");
  }

  const { data: matches, error: matchError } = await db.rpc(
    "burhan_find_anchor_occurrences",
    {
      p_anchor: normalizedAnchor,
      p_juz: input.juz ?? null,
    },
  );

  if (matchError) throw new Error(matchError.message);

  const allMatches = (matches ?? []) as AnchorMatch[];
  const selected =
    input.occurrencesRequired === "all"
      ? allMatches
      : chooseEvenly(allMatches, Math.min(input.occurrencesRequired, allMatches.length));

  const surahIds = [...new Set(selected.map((match) => match.surah_id))];
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
    const following = Array.from(
      { length: input.ayahsAfter + 1 },
      (_, offset) =>
        ayahByKey.get(`${match.surah_id}:${match.ayah_number + offset}`),
    ).filter(Boolean);

    return {
      surah_id: match.surah_id,
      ayah_number: match.ayah_number,
      anchor_start: match.anchor_start,
      anchor_end: match.anchor_end,
      ayahs: following,
    };
  });

  return {
    anchor: input.anchor,
    normalized_anchor: normalizedAnchor,
    occurrences_found: allMatches.length,
    occurrences_returned: occurrenceResults.length,
    occurrences: occurrenceResults,
  };
}
