import { getSupabaseAdmin } from "../supabase-admin";

export type BlueprintInput = {
  juz: number;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  testType?: "non_cumulative" | "cumulative" | "custom";
  questionCount?: number;
};

export type BlueprintQuestionSpec =
  | { type: "mutashabihat"; anchor: string; occurrences_required: number; ayahs_after: number; threshold: number; limit: number; juz: number }
  | { type: "recite_range"; start: { surah_id: number; ayah_number: number }; end: { surah_id: number; ayah_number: number } };

type Candidate = { text_ar: string; normalized_text: string; anchor_type: string; occurrence_count: number };

const LEVELS = {
  1: { mutashabihatRatio: 0.25, rangeAyahs: 2, occurrences: 1 },
  2: { mutashabihatRatio: 0.35, rangeAyahs: 3, occurrences: 1 },
  3: { mutashabihatRatio: 0.5, rangeAyahs: 3, occurrences: 2 },
  4: { mutashabihatRatio: 0.6, rangeAyahs: 4, occurrences: 2 },
  5: { mutashabihatRatio: 0.7, rangeAyahs: 5, occurrences: 2 },
  6: { mutashabihatRatio: 0.8, rangeAyahs: 5, occurrences: 3 },
  7: { mutashabihatRatio: 0.9, rangeAyahs: 6, occurrences: "all" as const },
} as const;

async function getRangeCandidates(juz: number) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("ayahs").select("surah_id,ayah_number").eq("juz_number", juz).order("surah_id").order("ayah_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ surah_id: number; ayah_number: number }>;
}

async function getAnchorCandidates(juz: number, limit = 80) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("burhan_blueprint_anchor_candidates", { p_juz: juz, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as Candidate[];
}

function pickEvenly<T>(items: T[], count: number) {
  if (count >= items.length) return [...items];
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * items.length / count)]);
}

function buildRanges(ayahs: Array<{ surah_id: number; ayah_number: number }>, count: number, length: number) {
  const usable = ayahs.filter((_, i) => i + length <= ayahs.length);
  return pickEvenly(usable, count).map((start) => {
    const index = ayahs.findIndex((a) => a.surah_id === start.surah_id && a.ayah_number === start.ayah_number);
    const end = ayahs[index + length - 1];
    return { type: "recite_range" as const, start, end };
  });
}

export async function buildTestBlueprint(input: BlueprintInput) {
  const questionCount = Math.max(1, Math.min(input.questionCount ?? 10, 100));
  const level = LEVELS[input.level];
  const mutCount = Math.round(questionCount * level.mutashabihatRatio);
  const rangeCount = questionCount - mutCount;
  const [ayahs, candidates] = await Promise.all([getRangeCandidates(input.juz), getAnchorCandidates(input.juz)]);
  if (ayahs.length < level.rangeAyahs && rangeCount > 0) throw new Error("Not enough ayahs in this Juz for the requested blueprint.");
  if (mutCount > 0 && candidates.length < mutCount) throw new Error(`Not enough unique repeated-anchor candidates in this Juz: need ${mutCount}, found ${candidates.length}.`);

  const anchorSpecs: BlueprintQuestionSpec[] = [];
  const usedAnchors = new Set<string>();
  for (let i = 0; i < mutCount; i++) {
    const candidate = candidates[i % candidates.length];
    if (usedAnchors.has(candidate.normalized_text) && candidates.length > usedAnchors.size) {
      const next = candidates.find((c) => !usedAnchors.has(c.normalized_text));
      if (next) {
        usedAnchors.add(next.normalized_text);
        anchorSpecs.push({ type: "mutashabihat", anchor: next.text_ar, occurrences_required: Math.min(level.occurrences === "all" ? candidate.occurrence_count : level.occurrences, candidate.occurrence_count), ayahs_after: input.level >= 5 ? 2 : 1, threshold: input.level >= 6 ? 0.55 : 0.45, limit: 30, juz: input.juz });
        continue;
      }
    }
    usedAnchors.add(candidate.normalized_text);
    anchorSpecs.push({ type: "mutashabihat", anchor: candidate.text_ar, occurrences_required: Math.min(level.occurrences === "all" ? candidate.occurrence_count : level.occurrences, candidate.occurrence_count), ayahs_after: input.level >= 5 ? 2 : 1, threshold: input.level >= 6 ? 0.55 : 0.45, limit: 30, juz: input.juz });
  }

  const ranges = buildRanges(ayahs, rangeCount, level.rangeAyahs);
  const questions = [...anchorSpecs, ...ranges];
  return {
    juz: input.juz, level: input.level, test_type: input.testType ?? "custom", question_count: questions.length,
    config: {
      generator: "burhan-v1-independent-blueprint",
      mutashabihat_count: anchorSpecs.length, recite_range_count: ranges.length,
      mutashabihat_ratio: level.mutashabihatRatio, range_ayahs: level.rangeAyahs,
      occurrences_target: level.occurrences,
      note: "Independent heuristic inspired by the documented methodology; not a reproduction of any external question bank.",
    },
    questions,
  };
}