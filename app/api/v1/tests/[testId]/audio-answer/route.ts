import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../../lib/supabase-admin";
import { evaluateAudioTranscript } from "../../../../../../lib/burhan/audio-evaluator";
import { transcribeAudioFromUrl } from "../../../../../../lib/burhan/transcription";

const schema = z.object({
  attempt_id: z.string().uuid(),
  question_id: z.string().uuid(),
  audio_url: z.string().url().optional(),
  duration_ms: z.number().int().positive().max(30 * 60 * 1000).optional(),
  mime_type: z.string().max(100).optional(),
  transcript: z.string().min(1).max(20000).optional(),
  transcription_provider: z.string().max(100).optional(),
  transcription_confidence: z.number().min(0).max(1).optional(),
  transcription_language: z.string().max(20).default("ar"),
}).refine((value) => Boolean(value.transcript?.trim()) || Boolean(value.audio_url), { message: "Provide transcript or audio_url." });

export async function POST(
  request: Request,
  context: { params: Promise<{ testId: string }> },
) {
  const { testId } = await context.params;

  if (!z.string().uuid().safeParse(testId).success) {
    return NextResponse.json({ error: "INVALID_TEST_ID" }, { status: 400 });
  }

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
          .select("id,test_id,question_type,expected_answer")
          .eq("id", parsed.data.question_id)
          .maybeSingle(),
      ]);

    if (attemptError) throw new Error(attemptError.message);
    if (questionError) throw new Error(questionError.message);
    if (!attempt) return NextResponse.json({ error: "ATTEMPT_NOT_FOUND" }, { status: 404 });
    if (attempt.test_id !== testId) return NextResponse.json({ error: "ATTEMPT_TEST_MISMATCH" }, { status: 409 });
    if (attempt.submitted_at) return NextResponse.json({ error: "ATTEMPT_ALREADY_SUBMITTED" }, { status: 409 });
    if (!question) return NextResponse.json({ error: "QUESTION_NOT_FOUND" }, { status: 404 });
    if (question.test_id !== testId) return NextResponse.json({ error: "QUESTION_TEST_MISMATCH" }, { status: 409 });
    if (!["recite_range", "anchor_recall", "mutashabihat"].includes(question.question_type)) {
      return NextResponse.json(
        { error: "AUDIO_NOT_SUPPORTED_FOR_QUESTION_TYPE", question_type: question.question_type },
        { status: 422 },
      );
    }

    let transcript = parsed.data.transcript?.trim() ?? "";
    let transcriptionProvider = parsed.data.transcription_provider;
    let transcriptionConfidence = parsed.data.transcription_confidence;
    let durationMs = parsed.data.duration_ms;

    if (!transcript && parsed.data.audio_url) {
      const transcription = await transcribeAudioFromUrl({
        audioUrl: parsed.data.audio_url,
        language: parsed.data.transcription_language,
      });
      transcript = transcription.text.trim();
      transcriptionProvider = transcription.provider + ":" + transcription.model;
      transcriptionConfidence = transcription.confidence ?? undefined;
      if (durationMs == null && transcription.duration_seconds != null) {
        durationMs = Math.round(transcription.duration_seconds * 1000);
      }
    }

    const audioEvaluation = evaluateAudioTranscript(
      {
        id: question.id,
        question_type: question.question_type,
        expected_answer: question.expected_answer,
      },
      {
        ...parsed.data,
        transcript,
        transcription_provider: transcriptionProvider,
        transcription_confidence: transcriptionConfidence,
        duration_ms: durationMs,
      },
    );

    const answerPayload = {
      mode: "audio_transcript",
      text: transcript,
      transcript,
      audio_url: parsed.data.audio_url ?? null,
      duration_ms: durationMs ?? null,
      mime_type: parsed.data.mime_type ?? null,
      transcription_provider: transcriptionProvider ?? null,
      transcription_confidence: transcriptionConfidence ?? null,
      transcription_language: parsed.data.transcription_language,
    };

    const { error: answerError } = await db
      .from("test_answers")
      .upsert({
        attempt_id: attempt.id,
        question_id: question.id,
        answer: answerPayload,
        score: audioEvaluation.evaluation.score,
        is_correct: audioEvaluation.evaluation.status === "correct",
        feedback: audioEvaluation.evaluation.feedback,
      }, { onConflict: "attempt_id,question_id" });

    if (answerError) throw new Error(answerError.message);

    const { data: storedAudio, error: audioError } = await db
      .from("burhan_audio_answers")
      .upsert({
        attempt_id: attempt.id,
        question_id: question.id,
        audio_url: parsed.data.audio_url ?? null,
        duration_ms: parsed.data.duration_ms ?? null,
        mime_type: parsed.data.mime_type ?? null,
        transcript: parsed.data.transcript,
        transcription_provider: parsed.data.transcription_provider ?? null,
        transcription_confidence: parsed.data.transcription_confidence ?? null,
        transcription_language: parsed.data.transcription_language,
        evaluation: audioEvaluation.evaluation,
        updated_at: new Date().toISOString(),
      }, { onConflict: "attempt_id,question_id" })
      .select("id,attempt_id,question_id,audio_url,duration_ms,mime_type,transcript,transcription_provider,transcription_confidence,transcription_language,evaluation")
      .single();

    if (audioError || !storedAudio) {
      throw new Error(audioError?.message ?? "Failed to store audio answer.");
    }

    return NextResponse.json({
      attempt_id: attempt.id,
      question_id: question.id,
      audio_answer_id: storedAudio.id,
      mode: "audio_transcript",
      transcription: audioEvaluation.transcription,
      audio: audioEvaluation.audio,
      evaluation: audioEvaluation.evaluation,
      note: "Current v1 evaluates the STT transcript. Audio pronunciation and tajwid are not yet assessed.",
    });
  } catch (error) {
    console.error("Burhan audio answer failed", error);
    return NextResponse.json(
      {
        error: "AUDIO_ANSWER_ERROR",
        message: error instanceof Error ? error.message : "Unable to evaluate audio answer.",
      },
      { status: 500 },
    );
  }
}
