import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";
import { scoreDifficulty, anchorWordCount } from "./difficulty";

type Match = {
  id: string;
  surah_id: number;
  ayah_number: number;
  text_ar: string;
  normalized_text: string;
  juz_number: number;
  anchor_start: number;
  anchor_end: number;
};

export type AnchorRecallQuestion = {
  question_type: "anchor_recall";
  prompt: string;
  expected_answer: {
    anchor: string;
    occurrences_required: number | "all";
    ayahs_after: number;
    include_surah: boolean;
    occurrences: Array<{
      surah_id: number;
      surah_name: string | null;
      ayah_number: number;
      ayahs: Array<{ ayah_number: number; text_ar: string }>;
    }>;
  };
  difficulty: number;
  metadata: {
    occurrences_found: number;
    selected_occurrences: number;
    juz_min?: number;
    juz_max?: number;
  };
};

function chooseEvenly<T>(items: T[], count: number) {
  if (count >= items.length) return [...items];
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * items.length / count)]);
}

export async function generateAnchorRecallQuestion(input: {
  anchor: string;
  occurrencesRequired?: number | "all";
  ayahsAfter?: number;
  juzMin?: number;
  juzMax?: number;
  includeSurah?: boolean;
}): Promise<AnchorRecallQuestion> {
  const db = getSupabaseAdmin();
  const anchor = input.anchor.trim();
  const normalizedAnchor = normalizeArabic(anchor);
  if (!normalizedAnchor) throw new Error("Anchor becomes empty after normalization.");

  const occurrencesRequired = input.occurrencesRequired ?? 1;
  const ayahsAfter = input.ayahsAfter ?? 1;
  const includeSurah = input.includeSurah ?? false;

  const { data, error } = await db.rpc("burhan_find_anchor_occurrences_scope", {
    p_anchor: normalizedAnchor,
    p_juz_min: input.juzMin ?? null,
    p_juz_max: input.juzMax ?? null,
  });
  if (error) throw new Error(error.message);

  const matches = (data ?? []) as Match[];
  if (!matches.length) throw new Error(`No occurrence found for anchor "${anchor}".`);

  const selected = occurrencesRequired === "all"
    ? matches
    : chooseEvenly(matches, Math.min(occurrencesRequired, matches.length));

  const surahIds = [...new Set(selected.map((m) => m.surah_id))];
  const { data: ayahs, error: ayahError } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,text_ar")
    .in("surah_id", surahIds)
    .order("surah_id")
    .order("ayah_number");
  if (ayahError) throw new Error(ayahError.message);

  const byKey = new Map((ayahs ?? []).map((a) => [
    `${a.surah_id}:${a.ayah_number}`,
    a as { surah_id: number; ayah_number: number; text_ar: string },
  ]));

  let surahNames = new Map<number, string>();
  if (includeSurah) {
    const { data: surahs, error: surahError } = await db
      .from("surahs")
      .select("id,name_ar")
      .in("id", surahIds);
    if (surahError) throw new Error(surahError.message);
    surahNames = new Map((surahs ?? []).map((s) => [s.id as number, s.name_ar as string]));
  }

  const occurrences = selected.map((match) => ({
    surah_id: match.surah_id,
    surah_name: includeSurah ? (surahNames.get(match.surah_id) ?? null) : null,
    ayah_number: match.ayah_number,
    ayahs: Array.from({ length: ayahsAfter + 1 }, (_, offset) =>
      byKey.get(`${match.surah_id}:${match.ayah_number + offset}`)
    ).filter(Boolean).map((a) => ({
      ayah_number: a!.ayah_number,
      text_ar: a!.text_ar,
    })),
  }));

  const difficulty = scoreDifficulty({
    occurrenceCount: matches.length,
    anchorWordCount: anchorWordCount(normalizedAnchor),
    anchorCharCount: normalizedAnchor.length,
    requestedAyahs: ayahsAfter + 1,
  });

  const followLabel = ayahsAfter === 0
    ? "الآية"
    : `الآية وبعدها ${ayahsAfter === 1 ? "آية واحدة" : `${ayahsAfter} آيات`}`;
  const occurrenceLabel = occurrencesRequired === "all" ? "جميع المواضع" : `${selected.length} مواضع`;
  const surahLabel = includeSurah ? "، مع ذكر اسم السورة" : "";
  const prompt = `اذكر ${followLabel} لكل من ${occurrenceLabel} التي ورد فيها: «${anchor}»${surahLabel}`;

  return {
    question_type: "anchor_recall",
    prompt,
    expected_answer: {
      anchor,
      occurrences_required: occurrencesRequired,
      ayahs_after: ayahsAfter,
      include_surah: includeSurah,
      occurrences,
    },
    difficulty,
    metadata: {
      occurrences_found: matches.length,
      selected_occurrences: selected.length,
      juz_min: input.juzMin,
      juz_max: input.juzMax,
    },
  };
}
