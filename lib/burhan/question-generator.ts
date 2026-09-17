import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";
import { scoreDifficulty, anchorWordCount } from "./difficulty";
import { buildSimilarityFamilies, type SimilarityFamily } from "./similarity-family-engine";

type AnswerOccurrence = {
  surah_id: number;
  ayah_number: number;
  ayahs: Array<{ ayah_number: number; text_ar: string }>;
};

type GeneratedQuestion = {
  question_type: "mutashabihat";
  prompt: string;
  expected_answer: {
    anchor: string;
    occurrences_required: number | "all";
    ayahs_after: number;
    occurrences: AnswerOccurrence[];
  };
  difficulty: number;
  metadata: {
    family_name: string;
    similarity_score: number;
    occurrence_count: number;
  };
};

function chooseOccurrences(family: SimilarityFamily, requested: number | "all") {
  const members = [...family.members].sort((a, b) => {
    if (b.similarity_score !== a.similarity_score) return b.similarity_score - a.similarity_score;
    if (a.surah_id !== b.surah_id) return a.surah_id - b.surah_id;
    return a.ayah_number - b.ayah_number;
  });
  return requested === "all" ? members : members.slice(0, Math.min(requested, members.length));
}

async function attachFollowingAyahs(selected: SimilarityFamily["members"], ayahsAfter: number) {
  const db = getSupabaseAdmin();
  const surahIds = [...new Set(selected.map((member) => member.surah_id))];
  if (!surahIds.length) return [];

  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,text_ar")
    .in("surah_id", surahIds)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ surah_id: number; ayah_number: number; text_ar: string }>;
  const byKey = new Map(rows.map((row) => [`${row.surah_id}:${row.ayah_number}`, row]));

  return selected.map((member) => ({
    surah_id: member.surah_id,
    ayah_number: member.ayah_number,
    ayahs: Array.from({ length: ayahsAfter + 1 }, (_, offset) =>
      byKey.get(`${member.surah_id}:${member.ayah_number + offset}`),
    ).filter((ayah): ayah is { ayah_number: number; text_ar: string; surah_id: number } => Boolean(ayah)).map((ayah) => ({
      ayah_number: ayah.ayah_number,
      text_ar: ayah.text_ar,
    })),
  }));
}

export async function generateMutashabihatQuestion(input: {
  anchor: string;
  occurrencesRequired?: number | "all";
  ayahsAfter?: number;
  threshold?: number;
  limit?: number;
  juz?: number;
}): Promise<GeneratedQuestion> {
  const anchor = input.anchor.trim();
  const normalized = normalizeArabic(anchor);
  if (!normalized) throw new Error("Anchor becomes empty after normalization.");

  const occurrencesRequired = input.occurrencesRequired ?? 2;
  const ayahsAfter = input.ayahsAfter ?? 1;
  const result = await buildSimilarityFamilies({ anchor, threshold: input.threshold, limit: input.limit, persist: true, juz: input.juz });

  const family = [...result.families]
    .filter((candidate) => candidate.members.length >= (occurrencesRequired === "all" ? 2 : occurrencesRequired))
    .sort((a, b) => b.difficulty - a.difficulty || b.similarity_score - a.similarity_score)[0];

  if (!family) throw new Error("No suitable similarity family found for this anchor.");

  const selected = chooseOccurrences(family, occurrencesRequired);
  const occurrences = await attachFollowingAyahs(selected, ayahsAfter);
  const difficulty = scoreDifficulty({
    occurrenceCount: result.occurrences_found,
    anchorWordCount: anchorWordCount(normalized),
    anchorCharCount: normalized.length,
    requestedAyahs: ayahsAfter + 1,
    similarityGroupSize: family.members.length,
  });

  const followLabel = ayahsAfter === 0 ? "الآية" : `الآية وبعدها ${ayahsAfter === 1 ? "آية واحدة" : `${ayahsAfter} آيات`}`;
  const occurrenceLabel = occurrencesRequired === "all" ? "كل المواضع" : `${occurrencesRequired} مواضع`;
  const prompt = `اذكر ${followLabel} لكل من ${occurrenceLabel} التي ورد فيها: «${anchor}»`;

  return {
    question_type: "mutashabihat",
    prompt,
    expected_answer: { anchor, occurrences_required: occurrencesRequired, ayahs_after: ayahsAfter, occurrences },
    difficulty,
    metadata: {
      family_name: family.name,
      similarity_score: family.similarity_score,
      occurrence_count: selected.length,
    },
  };
}
