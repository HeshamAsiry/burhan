import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { decideTeacherReview } from "../../../../lib/burhan/teacher-review";

const schema = z.object({
  attempt_id: z.string().uuid(),
  question_id: z.string().uuid(),
  audio_answer_id: z.string().uuid().optional(),
  analysis_version: z.string().max(100).default("tajweed-v1"),
  model: z.string().max(150).optional(),
  pronunciation_score: z.number().min(0).max(100).optional(),
  tajweed_score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  issue_detected: z.boolean().default(false),
  audio_quality: z.enum(["good", "unclear", "poor"]).default("good"),
  unresolved_items: z.number().int().min(0).max(1000).default(0),
  conflicting_signals: z.number().int().min(0).max(1000).default(0),
  summary: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const db = getSupabaseAdmin();

    const [{ data: attempt, error: attemptError }, { data: question, error: questionError }] =
      await Promise.all([
        db
          .from("test_attempts")
          .select("id,test_id,submitted_at")
          .eq("id", parsed.data.attempt_id)
          .maybeSingle(),
        db
          .from("test_questions")
          .select("id,test_id,question_type")
          .eq("id", parsed.data.question_id)
          .maybeSingle(),
      ]);

    if (attemptError) throw new Error(attemptError.message);
    if (questionError) throw new Error(questionError.message);
    if (!attempt) return NextResponse.json({ error: "ATTEMPT_NOT_FOUND" }, { status: 404 });
    if (!question) return NextResponse.json({ error: "QUESTION_NOT_FOUND" }, { status: 404 });
    if (attempt.submitted_at) {
      return NextResponse.json({ error: "ATTEMPT_ALREADY_SUBMITTED" }, { status: 409 });
    }
    if (question.test_id !== attempt.test_id) {
      return NextResponse.json({ error: "QUESTION_ATTEMPT_MISMATCH" }, { status: 409 });
    }
    if (!["recite_range", "anchor_recall", "mutashabihat"].includes(question.question_type)) {
      return NextResponse.json(
        { error: "TAJWEED_NOT_SUPPORTED_FOR_QUESTION_TYPE", question_type: question.question_type },
        { status: 422 },
      );
    }

    let audioAnswerId = parsed.data.audio_answer_id ?? null;

    if (audioAnswerId) {
      const { data: audioAnswer, error } = await db
        .from("burhan_audio_answers")
        .select("id,attempt_id,question_id")
        .eq("id", audioAnswerId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!audioAnswer) {
        return NextResponse.json({ error: "AUDIO_ANSWER_NOT_FOUND" }, { status: 404 });
      }
      if (audioAnswer.attempt_id !== attempt.id || audioAnswer.question_id !== question.id) {
        return NextResponse.json({ error: "AUDIO_ANSWER_MISMATCH" }, { status: 409 });
      }
    } else {
      const { data: audioAnswer, error } = await db
        .from("burhan_audio_answers")
        .select("id")
        .eq("attempt_id", attempt.id)
        .eq("question_id", question.id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      audioAnswerId = audioAnswer?.id ?? null;
    }

    const review = decideTeacherReview({
      confidence: parsed.data.confidence,
      issueDetected: parsed.data.issue_detected,
      audioQuality: parsed.data.audio_quality,
      unresolvedItems: parsed.data.unresolved_items,
      conflictingSignals: parsed.data.conflicting_signals,
    });

    const { data: analysis, error: analysisError } = await db
      .from("burhan_tajweed_analyses")
      .upsert(
        {
          attempt_id: attempt.id,
          question_id: question.id,
          audio_answer_id: audioAnswerId,
          analysis_version: parsed.data.analysis_version,
          model: parsed.data.model ?? null,
          pronunciation_score: parsed.data.pronunciation_score ?? null,
          tajweed_score: parsed.data.tajweed_score,
          confidence: parsed.data.confidence,
          issue_detected: parsed.data.issue_detected,
          audio_quality: parsed.data.audio_quality,
          unresolved_items: parsed.data.unresolved_items,
          conflicting_signals: parsed.data.conflicting_signals,
          verdict_status: review.verdictStatus,
          review_reasons: review.reasons,
          summary: parsed.data.summary,
          evidence: parsed.data.evidence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "attempt_id,question_id" },
      )
      .select(
        "id,attempt_id,question_id,audio_answer_id,analysis_version,model,pronunciation_score,tajweed_score,confidence,issue_detected,audio_quality,unresolved_items,conflicting_signals,verdict_status,review_reasons,summary,evidence,created_at,updated_at",
      )
      .single();

    if (analysisError || !analysis) {
      throw new Error(analysisError?.message ?? "Failed to store Tajweed analysis.");
    }

    return NextResponse.json({
      analysis,
      review: {
        status: review.verdictStatus,
        required: review.requiresTeacherReview,
        reasons: review.reasons,
      },
    });
  } catch (error) {
    console.error("Burhan Tajweed analysis failed", error);
    return NextResponse.json(
      {
        error: "TAJWEED_ANALYSIS_ERROR",
        message: error instanceof Error ? error.message : "Unable to store Tajweed analysis.",
      },
      { status: 500 },
    );
  }
}
