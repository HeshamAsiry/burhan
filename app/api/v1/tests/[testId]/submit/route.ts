import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../../lib/supabase-admin";
import { evaluateQuestion, summarizeEvaluations } from "../../../../../../lib/burhan/evaluator";

const answerSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.unknown(),
});

const schema = z.object({
  external_user_id: z.string().trim().min(1).max(200).optional(),
  answers: z.array(answerSchema).max(200).default([]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ testId: string }> },
) {
  const { testId } = await context.params;

  if (!z.string().uuid().safeParse(testId).success) {
    return NextResponse.json({ error: "INVALID_TEST_ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const db = getSupabaseAdmin();

    const { data: test, error: testError } = await db
      .from("tests")
      .select("id,status,level,test_type,juz_number")
      .eq("id", testId)
      .maybeSingle();

    if (testError) throw new Error(testError.message);
    if (!test) return NextResponse.json({ error: "TEST_NOT_FOUND" }, { status: 404 });

    const { data: questions, error: questionsError } = await db
      .from("test_questions")
      .select("id,position,question_type,expected_answer,difficulty")
      .eq("test_id", testId)
      .order("position", { ascending: true });

    if (questionsError) throw new Error(questionsError.message);
    if (!questions?.length) return NextResponse.json({ error: "TEST_HAS_NO_QUESTIONS" }, { status: 409 });

    const submittedByQuestion = new Map(
      parsed.data.answers.map((item) => [item.question_id, item.answer]),
    );

    const evaluations = questions.map((question) =>
      evaluateQuestion(
        {
          id: question.id,
          question_type: question.question_type,
          expected_answer: question.expected_answer,
        },
        submittedByQuestion.get(question.id),
      ),
    );

    const summary = summarizeEvaluations(evaluations);
    const startedAt = new Date().toISOString();
    const submittedAt = new Date().toISOString();

    const { data: attempt, error: attemptError } = await db
      .from("test_attempts")
      .insert({
        test_id: testId,
        external_user_id: parsed.data.external_user_id ?? null,
        started_at: startedAt,
        submitted_at: submittedAt,
        score: summary.score,
        mastery: summary.mastery,
        result: {
          version: "burhan-evaluator-v1",
          summary,
          questions: evaluations,
        },
      })
      .select("id,test_id,external_user_id,started_at,submitted_at,score,mastery,result")
      .single();

    if (attemptError || !attempt) {
      throw new Error(attemptError?.message ?? "Failed to create attempt.");
    }

    const answerRows = evaluations.map((evaluation) => ({
      attempt_id: attempt.id,
      question_id: evaluation.question_id,
      answer: submittedByQuestion.has(evaluation.question_id)
        ? submittedByQuestion.get(evaluation.question_id)
        : null,
      score: evaluation.score,
      is_correct: evaluation.status === "correct",
      feedback: evaluation.feedback,
    }));

    const { error: answersError } = await db
      .from("test_answers")
      .insert(answerRows);

    if (answersError) {
      await db.from("test_attempts").delete().eq("id", attempt.id);
      throw new Error(answersError.message);
    }

    return NextResponse.json({
      attempt_id: attempt.id,
      test: {
        id: test.id,
        level: test.level,
        test_type: test.test_type,
        juz: test.juz_number,
      },
      summary,
      questions: evaluations,
    });
  } catch (error) {
    console.error("Burhan test submission failed", error);
    return NextResponse.json(
      {
        error: "TEST_SUBMISSION_ERROR",
        message: error instanceof Error ? error.message : "Unable to submit test.",
      },
      { status: 500 },
    );
  }
}
