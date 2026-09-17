import { normalizeArabic } from "../../scripts/normalize-arabic";
import { scoreDifficulty, anchorWordCount } from "./difficulty";
import { buildSimilarityFamilies, type SimilarityFamily } from "./similarity-family-engine";

type GeneratedQuestion = {
  question_type: "mutashabihat";
  prompt: string;
  expected_answer: {
    anchor: string;
    occurrences_required: number | "all";
    ayahs_after: number;
    occurrences: Array<{
      surah_id: number;
      ayah_number: number;
      text_ar: string;
    }>;
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

  if (requested === "all") return members;
  return members.slice(0, Math.min(requested, members.length));
}

export async function generateMutashabihatQuestion(input: {
  anchor: string;
  occurrencesRequired?: number | "all";
  ayahsAfter?: number;
  threshold?: number;
  limit?: number;
}): Promise<GeneratedQuestion> {
  const anchor = input.anchor.trim();
  const normalized = normalizeArabic(anchor);
  if (!normalized) throw new Error("Anchor becomes empty after normalization.");

  const occurrencesRequired = input.occurrencesRequired ?? 2;
  const ayahsAfter = input.ayahsAfter ?? 1;
  const result = await buildSimilarityFamilies({
    anchor,
    threshold: input.threshold,
    limit: input.limit,
    persist: true,
  });

  const family = [...result.families]
    .filter((candidate) => candidate.members.length >= (occurrencesRequired === "all" ? 2 : occurrencesRequired))
    .sort((a, b) => {
      if (b.difficulty !== a.difficulty) return b.difficulty - a.difficulty;
      return b.similarity_score - a.similarity_score;
    })[0];

  if (!family) {
    throw new Error("No suitable similarity family found for this anchor.");
  }

  const selected = chooseOccurrences(family, occurrencesRequired);
  const difficulty = scoreDifficulty({
    occurrenceCount: result.occurrences_found,
    anchorWordCount: anchorWordCount(normalized),
    anchorCharCount: normalized.length,
    requestedAyahs: ayahsAfter + 1,
    similarityGroupSize: family.members.length,
  });

  const occurrenceLabel = occurrencesRequired === "all" ? "كل المواضع" : `كل من المواضع ${occurrencesRequired}`;
  const prompt = `اذكر الآية وبعدها ${ayahsAfter === 1 ? "آية واحدة" : `آيتين`} لـ${occurrenceLabel} التي ورد فيها: «${anchor}»`;

  return {
    question_type: "mutashabihat",
    prompt,
    expected_answer: {
      anchor,
      occurrences_required: occurrencesRequired,
      ayahs_after: ayahsAfter,
      occurrences: selected.map((member) => ({
        surah_id: member.surah_id,
        ayah_number: member.ayah_number,
        text_ar: member.text_ar,
      })),
    },
    difficulty,
    metadata: {
      family_name: family.name,
      similarity_score: family.similarity_score,
      occurrence_count: selected.length,
    },
  };
}
