import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";

export type AnchorRecallInput = {
  anchor: string;
  occurrencesRequired: number | "all";
  ayahsAfter: number;
  juz?: number;
};

export async function findAnchorRecall(input: AnchorRecallInput) {
  const db = getSupabaseAdmin();
  const normalizedAnchor = normalizeArabic(input.anchor);

  const { data: ayahs, error: ayahError } = await db
    .from("ayahs")
    .select("id,surah_id,ayah_number,text_ar,normalized_text,juz_number")
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });

  if (ayahError) throw new Error(ayahError.message);

  const matches = (ayahs ?? [])
    .filter((ayah) => !input.juz || ayah.juz_number === input.juz)
    .flatMap((ayah) => {
      const text = ayah.normalized_text;
      const found = [];
      let from = 0;
      while (true) {
        const index = text.indexOf(normalizedAnchor, from);
        if (index === -1) break;
        found.push({ ayah, start: index, end: index + normalizedAnchor.length });
        from = index + Math.max(normalizedAnchor.length, 1);
      }
      return found;
    });

  const selected = input.occurrencesRequired === "all"
    ? matches
    : matches.slice(0, input.occurrencesRequired);

  const occurrenceResults = [];
  for (const match of selected) {
    const { data: following, error } = await db
      .from("ayahs")
      .select("id,surah_id,ayah_number,text_ar")
      .eq("surah_id", match.ayah.surah_id)
      .gte("ayah_number", match.ayah.ayah_number)
      .lte("ayah_number", match.ayah.ayah_number + input.ayahsAfter)
      .order("ayah_number", { ascending: true });

    if (error) throw new Error(error.message);

    occurrenceResults.push({
      surah_id: match.ayah.surah_id,
      ayah_number: match.ayah.ayah_number,
      anchor_start: match.start,
      anchor_end: match.end,
      ayahs: following ?? [],
    });
  }

  return {
    anchor: input.anchor,
    normalized_anchor: normalizedAnchor,
    occurrences_found: matches.length,
    occurrences_returned: occurrenceResults.length,
    occurrences: occurrenceResults,
  };
}
