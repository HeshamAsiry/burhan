import { getSupabaseAdmin } from "../supabase-admin";
import { generateMutashabihatQuestion } from "./question-generator";
import { generateReciteRangeQuestion } from "./recite-range-generator";
import { buildTestBlueprint } from "./blueprint-engine";

export type TestQuestionSpec =
  | { type: "mutashabihat"; anchor: string; occurrences_required?: number | "all"; ayahs_after?: number; threshold?: number; limit?: number; juz?: number }
  | { type: "recite_range"; start: { surah_id: number; ayah_number: number; anchor?: string }; end: { surah_id: number; ayah_number: number; anchor?: string } };

export async function generateTest(input: {
  juz: number;
  level: number;
  testType?: string;
  questions?: TestQuestionSpec[];
  questionCount?: number;
  progression?: "from_30_to_1" | "from_1_to_30";
  persist?: boolean;
}) {
  const blueprint = input.questions?.length
    ? null
    : await buildTestBlueprint({
        juz: input.juz,
        level: input.level as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        testType: (input.testType as "non_cumulative" | "cumulative" | "custom" | undefined),
        questionCount: input.questionCount,
        progression: input.progression,
      });
  const specs = input.questions?.length ? input.questions : blueprint?.questions;
  if (!specs?.length) throw new Error("At least one question is required.");

  const generated = [];
  for (const spec of specs) {
    if (spec.type === "mutashabihat") {
      generated.push(await generateMutashabihatQuestion({
        anchor: spec.anchor,
        occurrencesRequired: spec.occurrences_required,
        ayahsAfter: spec.ayahs_after,
        threshold: spec.threshold,
        limit: spec.limit,
        juz: spec.juz ?? input.juz,
      }));
    } else {
      generated.push(await generateReciteRangeQuestion(spec));
    }
  }

  if (input.persist === false) {
    return {
      id: crypto.randomUUID(),
      status: "generated",
      level: input.level,
      test_type: input.testType ?? "custom",
      juz: input.juz,
      blueprint,
      questions: generated,
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
      level: input.level,
      test_type: input.testType ?? "custom",
      juz_number: input.juz,
      blueprint_id: blueprintId,
      config: { question_count: generated.length, generated_by: "burhan-v1" },
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
    questions: inserted ?? [],
  };
}