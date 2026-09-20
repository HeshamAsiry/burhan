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
  // Every Burhan Al-Itqan test keeps the same 10-question structure.
  // Difficulty is controlled by the selection/range rules below, not by
  // changing the question mix.
  1: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  2: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  3: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  4: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  5: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  6: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  7: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  8: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  9: { recite: 4, mutashabihat: 2, ayah_next: 4 },
  10: { recite: 4, mutashabihat: 2, ayah_next: 4 },
};

type Ayah = { surah_id: number; ayah_number: number };
type Candidate = { text_ar: string; normalized_text: string; anchor_type: string; occurrence_count: number };

function secureRandomInt(max: number) {
  if (max <= 1) return 0;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const buffer = new Uint32Array(1);
    cryptoObj.getRandomValues(buffer);
    return buffer[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickEvenly<T>(items: T[], count: number, offset = 0) {
  if (count <= 0 || !items.length) return [];
  const shuffled = shuffle(items);
  if (count >= shuffled.length) return shuffled.slice(0, count);
  const start = secureRandomInt(shuffled.length);
  return Array.from({ length: count }, (_, index) => shuffled[(start + index) % shuffled.length]);
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

function reciteLengthBounds(testNumber: number, ayahCount: number) {
  // Difficulty increases through longer possible recitation passages.
  // Every question remains variable, but never exceeds 30 ayahs.
  const maxByTest = Math.min(30, 5 + Math.ceil(testNumber * 2.5));
  const minLength = Math.min(5, ayahCount);
  const maxLength = Math.min(maxByTest, ayahCount);
  return { minLength, maxLength };
}

function numberToArabicWord(value: number) {
  const words: Record<number, string> = {
    5: "خمس",
    6: "ست",
    7: "سبع",
    8: "ثماني",
    9: "تسع",
    10: "عشر",
    11: "إحدى عشرة",
    12: "اثنتا عشرة",
    13: "ثلاث عشرة",
    14: "أربع عشرة",
    15: "خمس عشرة",
    16: "ست عشرة",
    17: "سبع عشرة",
    18: "ثماني عشرة",
    19: "تسع عشرة",
    20: "عشرين",
    21: "إحدى وعشرين",
    22: "اثنتين وعشرين",
    23: "ثلاثًا وعشرين",
    24: "أربعًا وعشرين",
    25: "خمسًا وعشرين",
    26: "ستًا وعشرين",
    27: "سبعًا وعشرين",
    28: "ثمانيًا وعشرين",
    29: "تسعًا وعشرين",
    30: "ثلاثين",
  };
  return words[value] ?? String(value);
}

function buildRanges(ayahs: Ayah[], count: number, testNumber: number) {
  if (count <= 0) return [];

  const { minLength, maxLength } = reciteLengthBounds(testNumber, ayahs.length);
  const candidates: Array<{ start: Ayah; end: Ayah; ayahCount: number }> = [];

  for (let i = 0; i < ayahs.length; i++) {
    const maxForStart = Math.min(maxLength, ayahs.length - i);
    if (maxForStart < minLength) continue;

    // Each candidate gets a random length in the allowed difficulty band.
    const length = minLength + secureRandomInt(maxForStart - minLength + 1);
    candidates.push({
      start: ayahs[i],
      end: ayahs[i + length - 1],
      ayahCount: length,
    });
  }

  return shuffle(candidates)
    .slice(0, Math.min(count, candidates.length))
    .map(({ start, end }) => ({
      type: "recite_range" as const,
      start,
      end,
    }));
}

function rangeProfileForJuz(testNumber: number, ayahCount: number) {
  return reciteLengthBounds(testNumber, ayahCount);
}


export async function buildBurhanItqanBlueprint(input: { juz: number; testNumber: number; questionCount?: number }) {
  const testNumber = Math.max(1, Math.min(10, input.testNumber));
  // Burhan Al-Itqan tests have a fixed 10-question structure.
  const questionCount = 10;
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
  const reciteCount = 4;
  const wordCount = 0;
  const sentenceCount = 0;
  const ayahNextCount = 4;
  const mutashabihatCount = 2;
  const mcqCount = 0;

  const questions: ItqanQuestionSpec[] = [
    ...buildRanges(ayahs, reciteCount, testNumber),
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
      following_ayahs: 5,
      cross_surah_ranges: true,
      short_surah_strategy: "fixed_six_ayah_passage",
      question_mix: { recite_range: reciteCount, word: wordCount, sentence: sentenceCount, ayah_and_next: ayahNextCount, mutashabihat: mutashabihatCount, mcq: mcqCount },
      cumulative: false,
      source_scope: `juz_${input.juz}`,
      note: "Burhan-generated questions and selection logic; this does not reproduce the external book's question bank.",
    },
    questions: questions.slice(0, questionCount),
  };
}
