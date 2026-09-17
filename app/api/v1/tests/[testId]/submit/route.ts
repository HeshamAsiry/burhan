import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../../lib/supabase-admin";
import { evaluateQuestion, summarizeEvaluations } from "../../../../../../lib/burhan/evaluator";
import { updateMasteryForAttempt } from "../../../../../../lib/burhan/mastery-engine";

const answerSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.unknown(),
});

const schema = z.object({
  attempt_id: z.string().uuid().optional(),
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
    const submittedAt = new Date().toISOString();
    const resultPayload = {
      version: "burhan-evaluator-v1",
      summary,
      questions: evaluations,
    };

    let attempt: any = null;

    if (parsed.data.attempt_id) {
      const { data: existing, error: existingError } = await db
        .from("test_attempts")
        .select("id,test_id,external_user_id,started_at,submitted_at,score,mastery,result")
        .eq("id", parsed.data.attempt_id)
        .maybeSingle();

      if (existingError) throw new Error(existingError.message);
      if (!existing) return NextResponse.json({ error: "ATTEMPT_NOT_FOUND" }, { status: 404 });
      if (existing.test_id !== testId) {
        return NextResponse.json({ error: "ATTEMPT_TEST_MISMATCH" }, { status: 409 });
      }
      if (existing.submitted_at) {
        return NextResponse.json({ error: "ATTEMPT_ALREADY_SUBMITTED" }, { status: 409 });
      }
      if (
        parsed.data.external_user_id &&
        existing.external_user_id &&
        parsed.data.external_user_id !== existing.external_user_id
      ) {
        return NextResponse.json({ error: "ATTEMPT_USER_MISMATCH" }, { status: 403 });
      }

      const { data: updated, error: updateError } = await db
        .from("test_attempts")
        .update({
          external_user_id: existing.external_user_id ?? parsed.data.external_user_id ?? null,
          submitted_at: submittedAt,
          score: summary.score,
          mastery: summary.mastery,
          result: resultPayload,
        })
        .eq("id", existing.id)
        .select("id,test_id,external_user_id,started_at,submitted_at,score,mastery,result")
        .single();

      if (updateError || !updated) {
        throw new Error(updateError?.message ?? "Failed to submit attempt.");
      }
      attempt = updated;
    } else {
      const { data: created, error: createError } = await db
        .from("test_attempts")
        .insert({
          test_id: testId,
          external_user_id: parsed.data.external_user_id ?? null,
          started_at: submittedAt,
          submitted_at: submittedAt,
          score: summary.score,
          mastery: summary.mastery,
          result: resultPayload,
        })
        .select("id,test_id,external_user_id,started_at,submitted_at,score,mastery,result")
        .single();

      if (createError || !created) {
        throw new Error(createError?.message ?? "Failed to create attempt.");
      }
      attempt = created;
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
      .upsert(answerRows, { onConflict: "attempt_id,question_id" });

    if (answersError) {
      if (!parsed.data.attempt_id) await db.from("test_attempts").delete().eq("id", attempt.id);
      throw new Error(answersError.message);
    }

    let masteryResult: { updated?: number; skipped?: string; attempt_id?: string; error?: string } = { skipped: "external_user_id_required" };
    try {
      masteryResult = await updateMasteryForAttempt({
        externalUserId: parsed.data.external_user_id,
        attemptId: attempt.id,
        evaluatedQuestions: questions.map((question, index) => ({ question, evaluation: evaluations[index] })),
        attemptedAt: submittedAt,
      });
    } catch (masteryError) {
      console.error("Burhan mastery update failed", masteryError);
      masteryResult = { error: masteryError instanceof Error ? masteryError.message : "Mastery update failed." };
    }

    return NextResponse.json({
      attempt_id: attempt.id,
      mastery: masteryResult,
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
