import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../lib/supabase-admin";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ testId: string }> },
) {
  const { testId } = await context.params;
  if (!z.string().uuid().safeParse(testId).success) {
    return NextResponse.json({ error: "INVALID_TEST_ID" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    const [{ data: test, error: testError }, { data: questions, error: questionsError }] =
      await Promise.all([
        db
          .from("tests")
          .select("id,status,level,test_type,juz_number,blueprint_id,config,created_at")
          .eq("id", testId)
          .maybeSingle(),
        db
          .from("test_questions")
          .select("id,position,question_type,prompt,expected_answer,difficulty")
          .eq("test_id", testId)
          .order("position", { ascending: true }),
      ]);

    if (testError) throw new Error(testError.message);
    if (questionsError) throw new Error(questionsError.message);
    if (!test) return NextResponse.json({ error: "TEST_NOT_FOUND" }, { status: 404 });

    return NextResponse.json({
      test: {
        id: test.id,
        status: test.status,
        level: test.level,
        test_type: test.test_type,
        juz: test.juz_number,
        blueprint_id: test.blueprint_id,
        config: test.config,
        created_at: test.created_at,
      },
      questions: (questions ?? []).map(publicQuestion),
    });
  } catch (error) {
    console.error("Burhan public test fetch failed", error);
    return NextResponse.json(
      {
        error: "TEST_FETCH_ERROR",
        message: error instanceof Error ? error.message : "Unable to load test.",
      },
      { status: 500 },
    );
  }
}
