import { getSupabaseAdmin } from "../supabase-admin";
import { generateMutashabihatQuestion } from "./question-generator";
import { generateReciteRangeQuestion } from "./recite-range-generator";

export type TestQuestionSpec =
  | { type: "mutashabihat"; anchor: string; occurrences_required?: number | "all"; ayahs_after?: number; threshold?: number; limit?: number }
  | { type: "recite_range"; start: { surah_id: number; ayah_number: number; anchor?: string }; end: { surah_id: number; ayah_number: number; anchor?: string } };

export async function generateTest(input: {
  juz: number; level: number; testType?: string; questions: TestQuestionSpec[]; persist?: boolean;
}) {
  if (!input.questions.length) throw new Error("At least one question is required.");

  const generated = [];
  for (const spec of input.questions) {
    if (spec.type === "mutashabihat") generated.push(await generateMutashabihatQuestion({
      anchor: spec.anchor, occurrencesRequired: spec.occurrences_required, ayahsAfter: spec.ayahs_after,
      threshold: spec.threshold, limit: spec.limit,
    }));
    else generated.push(await generateReciteRangeQuestion(spec));
  }

  if (input.persist === false) {
    return { id: crypto.randomUUID(), status: "generated", level: input.level, test_type: input.testType ?? "custom", juz: input.juz, questions: generated };
  }

  const db = getSupabaseAdmin();
  const { data: test, error: testError } = await db.from("tests").insert({
    status: "generated", level: input.level, test_type: input.testType ?? "custom",
    juz_number: input.juz, config: { question_count: generated.length, generated_by: "burhan-v1" },
  }).select("id,status,level,test_type,juz_number").single();

  if (testError || !test) throw new Error(testError?.message ?? "Failed to create test.");

  const rows = generated.map((q, i) => ({
    test_id: test.id, position: i + 1, question_type: q.question_type,
    prompt: { text: q.prompt }, expected_answer: q.expected_answer, difficulty: q.difficulty,
  }));

  const { data: inserted, error: questionError } = await db.from("test_questions").insert(rows)
    .select("id,position,question_type,prompt,expected_answer,difficulty");

  if (questionError) {
    await db.from("tests").delete().eq("id", test.id);
    throw new Error(questionError.message);
  }

  return { id: test.id, status: test.status, level: test.level, test_type: test.test_type, juz: test.juz_number, questions: inserted ?? [] };
}
