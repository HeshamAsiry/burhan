import { getSupabaseAdmin } from "../supabase-admin";
import { generateAutoFragmentRecallCandidates, type FragmentRecallMode } from "./fragment-recall-generator";

export type ItqanQuestionSpec =
  | {
      type: "recite_range";
      start: { surah_id: number; ayah_number: number };
      end: { surah_id: number; ayah_number: number };
    }
  | {
      type: "fragment_recall";
      mode: FragmentRecallMode;
      surah_id: number;
      ayah_number: number;
      fragment: string;
      ayahs_after: number;
    }
  | {
      type: "anchor_recall";
      anchor: string;
      occurrences_required: number;
      ayahs_after: number;
      juz_min: number;
      juz_max: number;
      include_surah: boolean;
    }
  | {
      type: "mutashabihat";
      anchor: string;
      occurrences_required: number;
      ayahs_after: number;
      threshold: number;
      limit: number;
      juz: number;
    }
  | {
      type: "mcq";
      surah_id: number;
      ayah_number: number;
    };

const PRESETS: Record<number, Record<string, number>> = {
  1: { recite: 4, word: 3, sentence: 1, anchor: 1, mcq: 1 },
  2: { recite: 4, word: 2, sentence: 2, anchor: 1, mcq: 1 },
  3: { recite: 3, word: 2, sentence: 2, mutashabihat: 1, anchor: 1, mcq: 1 },
  4: { recite: 3, word: 2, sentence: 2, mutashabihat: 2, mcq: 1 },
  5: { recite: 3, word: 1, sentence: 2, mutashabihat: 2, anchor: 1, mcq: 1 },
  6: { recite: 3, word: 1, sentence: 2, mutashabihat: 2, anchor: 1, mcq: 1 },
  7: { recite: 2, word: 1, sentence: 2, mutashabihat: 3, anchor: 1, mcq: 1 },
  8: { recite: 2, word: 1, sentence: 2, mutashabihat: 3, anchor: 1, mcq: 1 },
  9: { recite: 2, word: 1, sentence: 2, mutashabihat: 3, anchor: 1, mcq: 1 },
  10: { recite: 2, word: 1, sentence: 2, mutashabihat: 3, anchor: 1, mcq: 1 },
};

type Ayah = {
  surah_id: number;
  ayah_number: number;
};

type Candidate = {
  text_ar: string;
  normalized_text: string;
  anchor_type: string;
  occurrence_count: number;
};

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

async function getRepeatedAnchors(juz: number, limit = 100) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("burhan_blueprint_anchor_candidates", {
    p_juz: juz,
    p_limit: limit,
    p_cumulative: false,
    p_progression: "from_30_to_1",
  });

  if (error) throw new Error(error.message);

  return (data ?? []).filter(
    (candidate: Candidate) => candidate.occurrence_count >= 2,
  ) as Candidate[];
}

function buildRanges(ayahs: Ayah[], count: number, length: number, offset: number) {
  const usable = ayahs.filter((_, index) => index + length <= ayahs.length);
  return pickEvenly(usable, count, offset).map((start) => {
    const index = ayahs.findIndex(
      (ayah) => ayah.surah_id === start.surah_id && ayah.ayah_number === start.ayah_number,
    );
    const end = ayahs[index + length - 1];
    if (!end) throw new Error("Unable to resolve Burhan Al-Itqan recitation range.");
    return {
      type: "recite_range" as const,
      start,
      end,
    };
  });
}

export async function buildBurhanItqanBlueprint(input: {
  juz: number;
  testNumber: number;
  questionCount?: number;
}) {
  const testNumber = Math.max(1, Math.min(10, input.testNumber));
  const questionCount = Math.max(1, Math.min(input.questionCount ?? 10, 50));
  const preset = PRESETS[testNumber] ?? PRESETS[10];
  const totalPreset = Object.values(preset).reduce((sum, value) => sum + value, 0);
  const scale = questionCount / totalPreset;

  const [ayahs, anchors, words, sentences] = await Promise.all([
    getAyahs(input.juz),
    getRepeatedAnchors(input.juz),
    generateAutoFragmentRecallCandidates({ juz: input.juz, mode: "word", limit: 80 }),
    generateAutoFragmentRecallCandidates({ juz: input.juz, mode: "sentence", limit: 80 }),
  ]);

  if (!ayahs.length) throw new Error("No ayahs found for the selected Juz.");
  if (!anchors.length && (preset.mutashabihat || preset.anchor)) {
    throw new Error("No repeated Quran anchors found for the selected Juz.");
  }

  const rangeLength = Math.min(2 + Math.floor((testNumber - 1) / 2), 6);

  const reciteCount = Math.max(1, Math.round((preset.recite ?? 0) * scale));
  const wordCount = Math.max(0, Math.round((preset.word ?? 0) * scale));
  const sentenceCount = Math.max(0, Math.round((preset.sentence ?? 0) * scale));
  const mutashabihatCount = Math.max(0, Math.round((preset.mutashabihat ?? 0) * scale));
  const anchorCount = Math.max(0, Math.round((preset.anchor ?? 0) * scale));
  const mcqCount = Math.max(0, Math.round((preset.mcq ?? 0) * scale));

  const questions: ItqanQuestionSpec[] = [
    ...buildRanges(ayahs, reciteCount, rangeLength, testNumber - 1),
    ...pickEvenly(words, wordCount, testNumber).map((candidate) => ({
      type: "fragment_recall" as const,
      mode: "word" as const,
      surah_id: candidate.surah_id,
      ayah_number: candidate.ayah_number,
      fragment: candidate.fragment,
      ayahs_after: testNumber >= 8 ? 1 : 0,
    })),
    ...pickEvenly(sentences, sentenceCount, testNumber + 1).map((candidate) => ({
      type: "fragment_recall" as const,
      mode: "sentence" as const,
      surah_id: candidate.surah_id,
      ayah_number: candidate.ayah_number,
      fragment: candidate.fragment,
      ayahs_after: testNumber >= 6 ? 1 : 0,
    })),
    ...pickEvenly(anchors, mutashabihatCount, testNumber + 2).map((candidate) => ({
      type: "mutashabihat" as const,
      anchor: candidate.text_ar,
      occurrences_required: testNumber >= 8 ? Math.min(3, candidate.occurrence_count) : 2,
      ayahs_after: testNumber >= 7 ? 2 : 1,
      threshold: Math.min(0.9, 0.72 + testNumber * 0.015),
      limit: Math.min(20, Math.max(4, candidate.occurrence_count + 2)),
      juz: input.juz,
    })),
    ...pickEvenly(anchors, anchorCount, testNumber + 3).map((candidate) => ({
      type: "anchor_recall" as const,
      anchor: candidate.text_ar,
      occurrences_required: testNumber >= 7 ? Math.min(3, candidate.occurrence_count) : 1,
      ayahs_after: testNumber >= 6 ? 2 : 1,
      juz_min: input.juz,
      juz_max: input.juz,
      include_surah: testNumber >= 6,
    })),
    ...pickEvenly(ayahs, mcqCount, testNumber + 4).map((ayah) => ({
      type: "mcq" as const,
      surah_id: ayah.surah_id,
      ayah_number: ayah.ayah_number,
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
      range_length: rangeLength,
      question_mix: {
        recite_range: reciteCount,
        word: wordCount,
        sentence: sentenceCount,
        mutashabihat: mutashabihatCount,
        anchor_recall: anchorCount,
        mcq: mcqCount,
      },
      cumulative: false,
      source_scope: `juz_${input.juz}`,
      note: "Burhan-generated questions and selection logic; this does not reproduce the external book's question bank.",
    },
    questions: questions.slice(0, questionCount),
  };
}
