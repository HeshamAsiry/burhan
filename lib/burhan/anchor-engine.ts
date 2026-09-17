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

export async function findAnchorRecall(input: AnchorRecallInput) {
  const db = getSupabaseAdmin();
  const normalizedAnchor = normalizeArabic(input.anchor);

  if (!normalizedAnchor) {
    throw new Error("Anchor becomes empty after normalization.");
  }

  const { data: ayahs, error } = await db
    .from("ayahs")
    .select("id,surah_id,ayah_number,text_ar,normalized_text,juz_number")
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });

  if (error) throw new Error(error.message);

  const filteredAyahs = ((ayahs ?? []) as AyahRow[]).filter(
    (ayah) => !input.juz || ayah.juz_number === input.juz,
  );

  const matches = filteredAyahs.flatMap((ayah) => {
    const text = ayah.normalized_text ?? "";
    const found: Array<{
      ayah: AyahRow;
      normalizedStart: number;
      normalizedEnd: number;
    }> = [];

    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(normalizedAnchor, from);
      if (index === -1) break;

      found.push({
        ayah,
        normalizedStart: index,
        normalizedEnd: index + normalizedAnchor.length,
      });

      from = index + Math.max(normalizedAnchor.length, 1);
    }

    return found;
  });

  const selected =
    input.occurrencesRequired === "all"
      ? matches
      : matches.slice(0, input.occurrencesRequired);

  const ayahByKey = new Map(
    filteredAyahs.map((ayah) => [`${ayah.surah_id}:${ayah.ayah_number}`, ayah]),
  );

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
