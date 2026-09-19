import { getSupabaseAdmin } from "../supabase-admin";
import { generateMutashabihatQuestion } from "./question-generator";
import { generateAnchorRecallQuestion } from "./anchor-recall-generator";
import { generateIdentifySurahQuestion } from "./identify-surah-generator";
import { generateSurahMcqQuestion } from "./mcq-generator";
import { generateReciteRangeQuestion } from "./recite-range-generator";
import { buildTestBlueprint } from "./blueprint-engine";
import { buildBurhanItqanBlueprint } from "./itqan-blueprint-engine";
import { generateFragmentRecallQuestion } from "./fragment-recall-generator";
import { generateItqanMutashabihatQuestion } from "./itqan-mutashabihat-generator";

export type TestQuestionSpec =
  | { type: "mcq"; anchor?: string; surah_id?: number; ayah_number?: number }
  | { type: "identify_surah"; anchor?: string; surah_id?: number; ayah_number?: number }
  | { type: "anchor_recall"; anchor: string; occurrences_required?: number | "all"; ayahs_after?: number; juz_min?: number; juz_max?: number; include_surah?: boolean }
  | { type: "mutashabihat"; anchor: string; occurrences_required?: number | "all"; ayahs_after?: number; threshold?: number; limit?: number; juz?: number }
  | { type: "recite_range"; start: { surah_id: number; ayah_number: number; anchor?: string }; end: { surah_id: number; ayah_number: number; anchor?: string } }
  | { type: "fragment_recall"; mode: "word" | "sentence" | "ayah_and_next"; surah_id: number; ayah_number: number; fragment: string; ayahs_after?: number };

function publicQuestion(question: any) {
  const base = {
    id: question.id,
    position: question.position,
    question_type: question.question_type,
    prompt: question.prompt,
    difficulty: question.difficulty,
  };

  if (question.question_type === "mcq") {
    return {
      ...base,
      options: Array.isArray(question.expected_answer?.options)
        ? question.expected_answer.options.map((option: any) => ({
            id: option.id,
            surah_id: option.surah_id,
            surah_name_ar: option.surah_name_ar,
          }))
        : [],
    };
  }

  return base;
}

export async function generateTest(input: {
  juz: number;
  level: number;
  testType?: string;
  questions?: TestQuestionSpec[];
  questionCount?: number;
  style?: "default" | "burhan_itqan";
  testNumber?: number;
  progression?: "from_30_to_1" | "from_1_to_30";
  includeAnswers?: boolean;
  persist?: boolean;
}) {
  const blueprint = input.questions?.length
    ? null
    : input.style === "burhan_itqan"
      ? await buildBurhanItqanBlueprint({ juz: input.juz, testNumber: input.testNumber ?? 1, questionCount: input.questionCount })
      : await buildTestBlueprint({
        juz: input.juz,
        level: input.level as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        testType: (input.testType as "non_cumulative" | "cumulative" | "custom" | undefined),
        questionCount: input.questionCount,
        progression: input.progression,
      });
  const specs = input.questions?.length ? input.questions : blueprint?.questions;
  if (!specs?.length) throw new Error("At least one question is required.");
  const effectiveLevel = input.style === "burhan_itqan" && blueprint?.level != null ? blueprint.level : input.level;

  const generated = [];
  for (const spec of specs) {
    if (spec.type === "mcq") {
      generated.push(await generateSurahMcqQuestion({
        anchor: "anchor" in spec ? spec.anchor : undefined,
        surahId: spec.surah_id,
        ayahNumber: spec.ayah_number,
      }));
    } else if (spec.type === "identify_surah") {
      generated.push(await generateIdentifySurahQuestion({
        anchor: spec.anchor,
        surahId: spec.surah_id,
        ayahNumber: spec.ayah_number,
      }));
    } else if (spec.type === "anchor_recall") {
      generated.push(await generateAnchorRecallQuestion({
        anchor: spec.anchor,
        occurrencesRequired: spec.occurrences_required,
        ayahsAfter: spec.ayahs_after,
        juzMin: spec.juz_min,
        juzMax: spec.juz_max,
        includeSurah: spec.include_surah,
      }));
    } else if (spec.type === "mutashabihat") {
      if ("generation_engine" in spec && spec.generation_engine === "itqan_local") {
        generated.push(await generateItqanMutashabihatQuestion({
          anchor: spec.anchor,
          juz: spec.juz ?? input.juz,
          occurrencesRequired: spec.occurrences_required,
          ayahsAfter: spec.ayahs_after,
        }));
      } else {
        generated.push(await generateMutashabihatQuestion({
          anchor: spec.anchor,
          occurrencesRequired: spec.occurrences_required,
          ayahsAfter: spec.ayahs_after,
          threshold: spec.threshold,
          limit: spec.limit,
          juz: spec.juz ?? input.juz,
        }));
      }
    } else if (spec.type === "fragment_recall") {
      generated.push(await generateFragmentRecallQuestion({
        mode: spec.mode,
        surahId: spec.surah_id,
        ayahNumber: spec.ayah_number,
        fragment: spec.fragment,
        ayahsAfter: spec.ayahs_after,
      }));
    } else {
      generated.push(await generateReciteRangeQuestion(spec));
    }
  }

  if (input.persist === false) {
    return {
      id: crypto.randomUUID(),
      status: "generated",
      level: effectiveLevel,
      test_type: input.testType ?? "custom",
      juz: input.juz,
      style: input.style ?? "default",
      test_number: input.style === "burhan_itqan" ? input.testNumber ?? 1 : null,
      blueprint,
      questions: input.includeAnswers ? generated : generated.map((question) => publicQuestion(question)),
    };
  }

  const db = getSupabaseAdmin();
  let blueprintId: string | null = null;

  if (blueprint) {
    const { data: savedBlueprint, error: blueprintError } = await db
      .from("test_blueprints")
      .insert({
        name: `Juz ${blueprint.juz} · Level ${blueprint.level} · ${blueprint.test_type}`,
        description: "Independent Burhan test blueprint generated from Quran knowledge-map signals.",
        juz_number: blueprint.juz,
        level: blueprint.level,
        test_type: blueprint.test_type,
        question_count: blueprint.question_count,
        config: blueprint.config,
      })
      .select("id")
      .single();
    if (blueprintError || !savedBlueprint) {
      throw new Error(blueprintError?.message ?? "Failed to create blueprint.");
    }
    blueprintId = savedBlueprint.id;
  }

  const { data: test, error: testError } = await db
    .from("tests")
    .insert({
      status: "generated",
      level: effectiveLevel,
      test_type: input.testType ?? "custom",
      juz_number: input.juz,
      blueprint_id: blueprintId,
      config: { question_count: generated.length, generated_by: "burhan-v1", style: input.style ?? "default", test_number: input.style === "burhan_itqan" ? input.testNumber ?? 1 : null },
    })
    .select("id,status,level,test_type,juz_number")
    .single();

  if (testError || !test) {
    if (blueprintId) await db.from("test_blueprints").delete().eq("id", blueprintId);
    throw new Error(testError?.message ?? "Failed to create test.");
  }

  const rows = generated.map((q, i) => ({
    test_id: test.id,
    position: i + 1,
    question_type: q.question_type,
    prompt: { text: q.prompt },
    expected_answer: q.expected_answer,
    difficulty: q.difficulty,
  }));

  const { data: inserted, error: questionError } = await db
    .from("test_questions")
    .insert(rows)
    .select("id,position,question_type,prompt,expected_answer,difficulty");

  if (questionError) {
    await db.from("tests").delete().eq("id", test.id);
    if (blueprintId) await db.from("test_blueprints").delete().eq("id", blueprintId);
    throw new Error(questionError.message);
  }

  return {
    id: test.id,
    status: test.status,
    level: test.level,
    test_type: test.test_type,
    juz: test.juz_number,
    blueprint_id: blueprintId,
    blueprint,
    questions: input.includeAnswers ? inserted ?? [] : (inserted ?? []).map((question) => publicQuestion(question)),
  };
}