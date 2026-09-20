import { getSupabaseAdmin } from "../supabase-admin";
import { generateAutoFragmentRecallCandidates, type FragmentRecallMode } from "./fragment-recall-generator";
import { getItqanMutashabihatCandidates } from "./itqan-mutashabihat-generator";

export type ItqanQuestionSpec =
  | { type: "recite_range"; start: { surah_id: number; ayah_number: number }; end: { surah_id: number; ayah_number: number } }
  | { type: "fragment_recall"; mode: FragmentRecallMode; surah_id: number; ayah_number: number; fragment: string; ayahs_after: number }
  | { type: "anchor_recall"; anchor: string; occurrences_required: number; ayahs_after: number; juz_min: number; juz_max: number; include_surah: boolean }
  | { type: "mutashabihat"; anchor: string; occurrences_required: number; ayahs_after: number; threshold: number; limit: number; juz: number; generation_engine?: "default" | "itqan_local" }
  | { type: "mcq"; surah_id: number; ayah_number: number };

const PRESETS: Record<number, Record<string, number>> = {
  1: { recite: 4, word: 2, sentence: 1, ayah_next: 2, mcq: 1 },
  2: { recite: 4, word: 2, sentence: 1, ayah_next: 2, mutashabihat: 1, mcq: 1 },
  3: { recite: 3, word: 2, sentence: 1, ayah_next: 2, mutashabihat: 1, mcq: 1 },
  4: { recite: 3, word: 2, sentence: 1, ayah_next: 2, mutashabihat: 1, mcq: 1 },
  5: { recite: 3, word: 1, sentence: 1, ayah_next: 2, mutashabihat: 2, mcq: 1 },
  6: { recite: 3, word: 1, sentence: 1, ayah_next: 2, mutashabihat: 2, mcq: 1 },
  7: { recite: 2, word: 1, sentence: 1, ayah_next: 2, mutashabihat: 3, mcq: 1 },
  8: { recite: 2, word: 1, sentence: 1, ayah_next: 2, mutashabihat: 3, mcq: 1 },
  9: { recite: 2, word: 1, sentence: 1, ayah_next: 2, mutashabihat: 3, mcq: 1 },
  10: { recite: 2, word: 1, sentence: 1, ayah_next: 2, mutashabihat: 3, mcq: 1 },
};

type Ayah = { surah_id: number; ayah_number: number };
type Candidate = { text_ar: string; normalized_text: string; anchor_type: string; occurrence_count: number };

function pickEvenly<T>(items: T[], count: number, offset = 0) {
  if (count <= 0 || !items.length) return [];
  if (count >= items.length) return items.slice(offset % items.length).concat(items.slice(0, offset % items.length)).slice(0, count);
  return Array.from({ length: count }, (_, index) => items[(Math.floor(index * items.length / count) + offset) % items.length]);
}

async function getAyahs(juz: number) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number")
    .eq("juz_number", juz)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Ayah[];
}

function groupAyahsBySurah(ayahs: Ayah[]) {
  const groups: Ayah[][] = [];
  for (const ayah of ayahs) {
    const last = groups[groups.length - 1];
    if (!last || last[0].surah_id !== ayah.surah_id) groups.push([ayah]);
    else last.push(ayah);
  }
  return groups;
}

function isMiddleAyah(index: number, length: number) {
  return length >= 3 && index > 0 && index < length - 1;
}

function middleEndIndex(length: number, offset: number) {
  if (length <= 2) return null;
  const first = Math.max(1, Math.floor(length * 0.25));
  const last = Math.min(length - 2, Math.ceil(length * 0.75));
  return first + (offset % Math.max(1, last - first + 1));
}

function buildCrossSurahRanges(ayahs: Ayah[], count: number, minLength: number, maxLength: number, offset: number) {
  const groups = groupAyahsBySurah(ayahs);
  const candidates: Array<{ start: Ayah; end: Ayah; pattern: string }> = [];

  // Pattern A: middle of a surah -> middle of a later surah.
  // Prefer crossing 2+ surah boundaries when the Juz has enough material.
  for (let i = 0; i < groups.length; i++) {
    const startGroup = groups[i];
    for (let startIndex = 1; startIndex < startGroup.length - 1; startIndex++) {
      for (let distance = 1; distance <= Math.min(3, groups.length - i - 1); distance++) {
        const endGroup = groups[i + distance];
        const endIndex = middleEndIndex(endGroup.length, startIndex + distance + offset);
        if (endIndex == null) continue;
        const start = startGroup[startIndex];
        const end = endGroup[endIndex];
        const startFlat = ayahs.findIndex((a) => a.surah_id === start.surah_id && a.ayah_number === start.ayah_number);
        const endFlat = ayahs.findIndex((a) => a.surah_id === end.surah_id && a.ayah_number === end.ayah_number);
        const span = endFlat - startFlat + 1;
        if (span >= minLength && span <= maxLength) {
          candidates.push({
            start,
            end,
            pattern: distance >= 2 ? "middle_to_middle_multi_surah" : "middle_to_middle_cross_surah",
          });
        }
      }
    }
  }

  // Pattern B: last few ayahs of a surah -> middle of the next/later surah.
  for (let i = 0; i < groups.length - 1; i++) {
    const startGroup = groups[i];
    const endGroup = groups[i + 1];
    const startFrom = Math.max(0, startGroup.length - 3);
    for (let startIndex = startFrom; startIndex < startGroup.length; startIndex++) {
      const endIndex = middleEndIndex(endGroup.length, startIndex + offset);
      if (endIndex == null) continue;
      const start = startGroup[startIndex];
      const end = endGroup[endIndex];
      const startFlat = ayahs.findIndex((a) => a.surah_id === start.surah_id && a.ayah_number === start.ayah_number);
      const endFlat = ayahs.findIndex((a) => a.surah_id === end.surah_id && a.ayah_number === end.ayah_number);
      const span = endFlat - startFlat + 1;
      if (span >= minLength && span <= maxLength) {
        candidates.push({ start, end, pattern: "end_to_middle_next_surah" });
      }
    }
  }

  const unique = new Map<string, { start: Ayah; end: Ayah; pattern: string }>();
  for (const candidate of candidates) {
    const key = `${candidate.start.surah_id}:${candidate.start.ayah_number}-${candidate.end.surah_id}:${candidate.end.ayah_number}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }

  const pool = Array.from(unique.values());
  return pickEvenly(pool, count, offset).map(({ start, end }) => ({
    type: "recite_range" as const,
    start,
    end,
  }));
}

function buildRanges(ayahs: Ayah[], count: number, minLength: number, maxLength: number, offset: number) {
  if (count <= 0) return [];

  // Cross-surah patterns are preferred so short-surah Juzs (especially Juz 30)
  // do not collapse into trivial single-surah passages.
  const crossSurah = buildCrossSurahRanges(ayahs, count, minLength, maxLength, offset);
  if (crossSurah.length >= count) return crossSurah;

  // Fallback: preserve contiguous Quran order when there are not enough
  // structurally suitable cross-surah candidates.
  const usable = ayahs.filter((_, index) => index + minLength <= ayahs.length);
  return pickEvenly(usable, count, offset).map((start, rangeIndex) => {
    const startIndex = ayahs.findIndex(
      (ayah) => ayah.surah_id === start.surah_id && ayah.ayah_number === start.ayah_number,
    );
    const span = Math.min(
      maxLength,
      Math.max(minLength, minLength + ((rangeIndex + offset) % Math.max(1, maxLength - minLength + 1))),
    );
    const end = ayahs[startIndex + span - 1];
    if (!end) throw new Error("Unable to resolve Burhan Al-Itqan recitation range.");
    return { type: "recite_range" as const, start, end };
  });
}

function rangeProfileForJuz(juz: number, ayahCount: number) {
  // Juzs dominated by short surahs need longer cross-surah passages.
  // This intentionally permits:
  // - start in the middle of a surah -> continue across one or more surahs -> stop mid-surah
  // - start near the end of a surah -> continue into the next surah -> stop mid-surah
  const shortSurahHeavy = juz === 30 || ayahCount < 120;

  if (shortSurahHeavy) {
    return {
      minLength: 12,
      maxLength: Math.min(24, Math.max(12, ayahCount - 1)),
    };
  }

  return {
    minLength: 7,
    maxLength: Math.min(14, Math.max(7, ayahCount - 1)),
  };
}

export async function buildBurhanItqanBlueprint(input: { juz: number; testNumber: number; questionCount?: number }) {
  const testNumber = Math.max(1, Math.min(10, input.testNumber));
  const questionCount = Math.max(1, Math.min(input.questionCount ?? 10, 50));
  const preset = PRESETS[testNumber] ?? PRESETS[10];
  const totalPreset = Object.values(preset).reduce((sum, value) => sum + value, 0);
  const scale = questionCount / totalPreset;

  const [ayahs, words, sentences, nextAyahs, mutashabihat] = await Promise.all([
    getAyahs(input.juz),
    generateAutoFragmentRecallCandidates({ juz: input.juz, mode: "word", limit: 80 }),
    generateAutoFragmentRecallCandidates({ juz: input.juz, mode: "sentence", limit: 80 }),
    generateAutoFragmentRecallCandidates({ juz: input.juz, mode: "ayah_and_next", limit: 80 }),
    getItqanMutashabihatCandidates(input.juz, 80),
  ]);

  if (!ayahs.length) throw new Error("No ayahs found for the selected Juz.");
  if (!mutashabihat.length && preset.mutashabihat) throw new Error("No repeated Quran anchors found for the selected Juz.");

  const rangeProfile = rangeProfileForJuz(input.juz, ayahs.length);
  const reciteCount = Math.max(1, Math.round((preset.recite ?? 0) * scale));
  const wordCount = Math.max(0, Math.round((preset.word ?? 0) * scale));
  const sentenceCount = Math.max(0, Math.round((preset.sentence ?? 0) * scale));
  const ayahNextCount = Math.max(0, Math.round((preset.ayah_next ?? 0) * scale));
  const mutashabihatCount = Math.max(0, Math.round((preset.mutashabihat ?? 0) * scale));
  const mcqCount = Math.max(0, Math.round((preset.mcq ?? 0) * scale));

  const questions: ItqanQuestionSpec[] = [
    ...buildRanges(ayahs, reciteCount, rangeProfile.minLength, rangeProfile.maxLength, testNumber - 1),
    ...pickEvenly(words, wordCount, testNumber).map((candidate) => ({
      type: "fragment_recall" as const, mode: "word" as const,
      surah_id: candidate.surah_id, ayah_number: candidate.ayah_number, fragment: candidate.fragment, ayahs_after: 0,
    })),
    ...pickEvenly(sentences, sentenceCount, testNumber + 1).map((candidate) => ({
      type: "fragment_recall" as const, mode: "sentence" as const,
      surah_id: candidate.surah_id, ayah_number: candidate.ayah_number, fragment: candidate.fragment, ayahs_after: testNumber >= 6 ? 1 : 0,
    })),
    ...pickEvenly(nextAyahs, ayahNextCount, testNumber + 3).map((candidate) => ({
      type: "fragment_recall" as const, mode: "ayah_and_next" as const,
      surah_id: candidate.surah_id, ayah_number: candidate.ayah_number, fragment: candidate.fragment, ayahs_after: 0,
    })),
    ...pickEvenly(mutashabihat, mutashabihatCount, testNumber + 2).map((candidate) => ({
      type: "mutashabihat" as const, anchor: candidate.anchor,
      occurrences_required: testNumber >= 8 ? Math.min(3, candidate.occurrences.length) : 2,
      ayahs_after: testNumber >= 7 ? 2 : 1,
      threshold: Math.min(0.9, 0.72 + testNumber * 0.015),
      limit: Math.min(20, Math.max(4, candidate.occurrences.length + 2)),
      juz: input.juz, generation_engine: "itqan_local" as const,
    })),
    ...pickEvenly(ayahs, mcqCount, testNumber + 4).map((ayah) => ({
      type: "mcq" as const, surah_id: ayah.surah_id, ayah_number: ayah.ayah_number,
    })),
  ];

  return {
    style: "burhan_itqan",
    juz: input.juz,
    level: Math.min(7, Math.max(1, Math.ceil(testNumber * 0.7))),
    test_type: "non_cumulative",
    test_number: testNumber,
    question_count: Math.min(questionCount, questions.length),
    config: {
      methodology: "graded Quran memorization testing inspired by the publicly described Burhan Al-Itqan methodology",
      test_number: testNumber,
      range_length: rangeProfile,
      range_length_unit: "ayahs_inclusive",
      cross_surah_ranges: true,
      short_surah_strategy: "variable_length_cross_surah",
      question_mix: { recite_range: reciteCount, word: wordCount, sentence: sentenceCount, ayah_and_next: ayahNextCount, mutashabihat: mutashabihatCount, mcq: mcqCount },
      cumulative: false,
      source_scope: `juz_${input.juz}`,
      note: "Burhan-generated questions and selection logic; this does not reproduce the external book's question bank.",
    },
    questions: questions.slice(0, questionCount),
  };
}
