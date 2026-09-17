import { getSupabaseAdmin } from "../supabase-admin";

export type BlueprintInput = {
  juz: number;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  testType?: "non_cumulative" | "cumulative" | "custom";
  questionCount?: number;
  progression?: "from_30_to_1" | "from_1_to_30";
};

export type BlueprintQuestionSpec =
  | { type: "anchor_recall"; anchor: string; occurrences_required: number; ayahs_after: number; juz_min: number; juz_max: number; include_surah: boolean }
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
  7: { mutashabihatRatio: 0.9, rangeAyahs: 6, occurrences: 3 },
} as const;

async function getRangeCandidates(juz: number, cumulative: boolean, progression: "from_30_to_1" | "from_1_to_30") {
  const db = getSupabaseAdmin();
  const query = db.from("ayahs").select("surah_id,ayah_number,juz_number").order("surah_id").order("ayah_number");
  const { data, error } = cumulative
    ? progression === "from_30_to_1"
      ? await query.gte("juz_number", juz)
      : await query.lte("juz_number", juz)
    : await query.eq("juz_number", juz);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ surah_id: number; ayah_number: number; juz_number: number }>;
}

async function getAnchorCandidates(juz: number, cumulative: boolean, progression: "from_30_to_1" | "from_1_to_30", limit = 80) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("burhan_blueprint_anchor_candidates", { p_juz: juz, p_limit: limit, p_cumulative: cumulative, p_progression: progression });
  if (error) throw new Error(error.message);
  return (data ?? []) as Candidate[];
}

function pickEvenly<T>(items: T[], count: number) {
  if (count >= items.length) return [...items];
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * items.length / count)]);
}

function buildRanges(
  ayahs: Array<{ surah_id: number; ayah_number: number; juz_number?: number }>,
  count: number,
  length: number,
  currentJuz: number,
  cumulative: boolean,
) {
  const make = (pool: typeof ayahs, n: number) => {
    const usable = pool.filter((_, i) => i + length <= pool.length);
    return pickEvenly(usable, n).map((start) => {
      const index = ayahs.findIndex((a) => a.surah_id === start.surah_id && a.ayah_number === start.ayah_number);
      const end = ayahs[index + length - 1];
      return { type: "recite_range" as const, start, end };
    });
  };

  if (!cumulative) return make(ayahs, count);

  const byJuz = new Map<number, typeof ayahs>();
  for (const ayah of ayahs) {
    if (ayah.juz_number == null) continue;
    const list = byJuz.get(ayah.juz_number) ?? [];
    list.push(ayah);
    byJuz.set(ayah.juz_number, list);
  }

  const juzNumbers = [...byJuz.keys()].sort((a, b) => a - b);
  const currentPool = byJuz.get(currentJuz) ?? [];
  const previousJuzs = juzNumbers.filter((j) => j !== currentJuz);
  const currentCount = Math.min(count, Math.max(1, Math.ceil(count * 0.6)));
  const previousCount = count - currentCount;

  const result = [...make(currentPool, currentCount)];
  if (previousCount <= 0 || !previousJuzs.length) return result;

  const perJuz = Math.floor(previousCount / previousJuzs.length);
  let remainder = previousCount % previousJuzs.length;
  for (const juz of previousJuzs) {
    const n = perJuz + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    if (n > 0) result.push(...make(byJuz.get(juz) ?? [], n));
  }

  return result.slice(0, count);
}

export async function buildTestBlueprint(input: BlueprintInput) {
  const questionCount = Math.max(1, Math.min(input.questionCount ?? 10, 100));
  const level = LEVELS[input.level];
  const mutCount = Math.round(questionCount * level.mutashabihatRatio);
  const rangeCount = questionCount - mutCount;
  const cumulative = input.testType === "cumulative";
  const progression = input.progression ?? "from_30_to_1";
  const [ayahs, candidates] = await Promise.all([getRangeCandidates(input.juz, cumulative, progression), getAnchorCandidates(input.juz, cumulative, progression)]);
  if (ayahs.length < level.rangeAyahs && rangeCount > 0) throw new Error("Not enough ayahs in the selected cumulative scope for the requested blueprint.");
  if (mutCount > 0 && candidates.length < mutCount) throw new Error(`Not enough unique repeated-anchor candidates in the selected scope: need ${mutCount}, found ${candidates.length}.`);

  const anchorSpecs: BlueprintQuestionSpec[] = [];
  const usedAnchors = new Set<string>();
  for (let i = 0; i < mutCount; i++) {
    const candidate = candidates[i % candidates.length];
    if (usedAnchors.has(candidate.normalized_text) && candidates.length > usedAnchors.size) {
      const next = candidates.find((c) => !usedAnchors.has(c.normalized_text));
      if (next) {
        usedAnchors.add(next.normalized_text);
        anchorSpecs.push({ type: "anchor_recall", anchor: next.text_ar, occurrences_required: Math.min(level.occurrences === "all" ? candidate.occurrence_count : level.occurrences, candidate.occurrence_count), ayahs_after: input.level >= 5 ? 2 : 1, juz_min: cumulative ? (progression === "from_30_to_1" ? input.juz : 1), juz_max: cumulative ? (progression === "from_30_to_1" ? 30 : input.juz) : input.juz, include_surah: input.level >= 3 });
        continue;
      }
    }
    usedAnchors.add(candidate.normalized_text);
    anchorSpecs.push({ type: "anchor_recall", anchor: candidate.text_ar, occurrences_required: Math.min(level.occurrences, candidate.occurrence_count), ayahs_after: input.level >= 5 ? 2 : 1, juz_min: cumulative ? (progression === "from_30_to_1" ? input.juz : 1) : input.juz, juz_max: cumulative ? (progression === "from_30_to_1" ? 30 : input.juz) : input.juz, include_surah: input.level >= 3 });
  }

  const ranges = buildRanges(ayahs, rangeCount, level.rangeAyahs, input.juz, cumulative);
  const questions = [...anchorSpecs, ...ranges];
  return {
    juz: input.juz, level: input.level, test_type: input.testType ?? "custom", question_count: questions.length,
    config: {
      generator: "burhan-v1-independent-blueprint",
      anchor_recall_count: anchorSpecs.length, recite_range_count: ranges.length,
      anchor_recall_ratio: level.mutashabihatRatio, range_ayahs: level.rangeAyahs,
      occurrences_target: level.occurrences,
      cumulative,
      progression,
      coverage_scope: cumulative
        ? progression === "from_30_to_1" ? `juz_${input.juz}_to_30` : `juz_1_to_${input.juz}`
        : `juz_${input.juz}`,
      note: "Independent heuristic inspired by the documented methodology; not a reproduction of any external question bank.",
    },
    questions,
  };
}