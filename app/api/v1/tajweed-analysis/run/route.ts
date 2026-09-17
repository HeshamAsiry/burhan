import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../lib/supabase-admin";
import { comparePhonemes } from "../../../../../lib/burhan/phoneme-evaluator";
import { decideTeacherReview } from "../../../../../lib/burhan/teacher-review";
import { runPhonemeProvider } from "../../../../../lib/burhan/phoneme-provider";

const schema = z.object({
  attempt_id: z.string().uuid(),
  question_id: z.string().uuid(),
  audio_url: z.string().url(),
});

function collectExpectedAyahRefs(
  value: unknown,
  output = new Map<string, { surah_id: number; ayah_number: number }>(),
): Array<{ surah_id: number; ayah_number: number }> {
  if (Array.isArray(value)) {
    for (const item of value) collectExpectedAyahRefs(item, output);
    return [...output.values()];
  }

  if (!value || typeof value !== "object") return [...output];

  const object = value as Record<string, unknown>;
  if (
    typeof object.surah_id === "number" &&
    typeof object.ayah_number === "number" &&
    Number.isInteger(object.surah_id) &&
    Number.isInteger(object.ayah_number) &&
    object.surah_id >= 1 &&
    object.surah_id <= 114 &&
    object.ayah_number >= 1
  ) {
    output.set(object.surah_id + ":" + object.ayah_number, {
      surah_id: object.surah_id,
      ayah_number: object.ayah_number,
    });
  }

  for (const nested of Object.values(object)) {
    collectExpectedAyahRefs(nested, output);
  }

  return [...output.values()];
}

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

    const expectedAyahRefs = collectExpectedAyahRefs(question.expected_answer);

    if (!expectedAyahRefs.length) {
      return NextResponse.json(
        { error: "QUESTION_HAS_NO_AYAH_REFERENCES" },
        { status: 422 },
      );
    }

    const surahIds = [...new Set(expectedAyahRefs.map((ref) => ref.surah_id))];

    const { data: candidateAyahs, error: ayahsError } = await db
      .from("ayahs")
      .select("id,surah_id,ayah_number")
      .in("surah_id", surahIds);

    if (ayahsError) throw new Error(ayahsError.message);

    const expectedKeys = new Set(
      expectedAyahRefs.map((ref) => ref.surah_id + ":" + ref.ayah_number),
    );

    const orderedAyahs = [...(candidateAyahs ?? [])]
      .filter((ayah) => expectedKeys.has(ayah.surah_id + ":" + ayah.ayah_number))
      .sort(
        (a, b) => a.surah_id - b.surah_id || a.ayah_number - b.ayah_number,
      );

    if (orderedAyahs.length !== expectedKeys.size) {
      return NextResponse.json(
        {
          error: "EXPECTED_AYAH_REFERENCE_NOT_FOUND",
          required_ayahs: expectedKeys.size,
          resolved_ayahs: orderedAyahs.length,
        },
        { status: 409 },
      );
    }

    const { data: references, error: referencesError } = await db
      .from("quran_phoneme_references")
      .select("ayah_id,phoneme_version,phonemes")
      .in(
        "ayah_id",
        orderedAyahs.map((ayah) => ayah.id),
      );

    if (referencesError) throw new Error(referencesError.message);

    if ((references?.length ?? 0) !== orderedAyahs.length) {
      return NextResponse.json(
        {
          error: "PHONEME_REFERENCE_NOT_READY",
          required_ayahs: orderedAyahs.length,
          available_ayahs: references?.length ?? 0,
        },
        { status: 409 },
      );
    }

    const referenceByAyah = new Map(
      (references ?? []).map((row) => [row.ayah_id, row]),
    );

    const referencePhonemes = orderedAyahs.flatMap((ayah) => {
      const value = referenceByAyah.get(ayah.id)?.phonemes;
      if (!Array.isArray(value)) {
        throw new Error("Invalid phoneme reference for ayah " + ayah.id);
      }
      return value.map((phoneme) => String(phoneme));
    });

    const referenceVersion = [
      ...new Set(
        (references ?? []).map((row) => String(row.phoneme_version)),
      ),
    ].join(",");

    const provider = await runPhonemeProvider({
      audioUrl: parsed.data.audio_url,
      referencePhonemes,
      questionId: question.id,
    });

    const phonemeEvaluation = comparePhonemes(
      referencePhonemes,
      provider.predicted_phonemes,
    );

    const issueDetected =
      provider.issue_detected ??
      phonemeEvaluation.score < 95;

    const finalVerdict =
      provider.tajweed_score == null
        ? (issueDetected ? "needs_teacher_review" : "not_assessed")
        : decideTeacherReview({
            confidence: provider.confidence,
            issueDetected,
            audioQuality: provider.audio_quality ?? "good",
            unresolvedItems:
              phonemeEvaluation.substitutions +
              phonemeEvaluation.deletions +
              phonemeEvaluation.insertions,
          }).verdictStatus;

    const review = decideTeacherReview({
      confidence: provider.confidence,
      issueDetected,
      audioQuality: provider.audio_quality ?? "good",
      unresolvedItems:
        phonemeEvaluation.substitutions +
        phonemeEvaluation.deletions +
        phonemeEvaluation.insertions,
    });

    const { data: audioAnswer, error: audioError } = await db
      .from("burhan_audio_answers")
      .upsert(
        {
          attempt_id: attempt.id,
          question_id: question.id,
          audio_url: parsed.data.audio_url,
          transcription_provider: "phoneme-provider:" + provider.provider + ":" + provider.model,
          transcription_confidence: provider.confidence,
          evaluation: {
            mode: "phoneme_analysis",
            phoneme_evaluation: phonemeEvaluation,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "attempt_id,question_id" },
      )
      .select("id")
      .single();

    if (audioError || !audioAnswer) {
      throw new Error(audioError?.message ?? "Failed to store phoneme audio result.");
    }

    const { data: analysis, error: analysisError } = await db
      .from("burhan_tajweed_analyses")
      .upsert(
        {
          attempt_id: attempt.id,
          question_id: question.id,
          audio_answer_id: audioAnswer.id,
          analysis_version: "tajweed-v1-phoneme",
          model: provider.provider + ":" + provider.model,
          pronunciation_score: phonemeEvaluation.score,
          tajweed_score: provider.tajweed_score ?? null,
          confidence: provider.confidence,
          issue_detected: issueDetected,
          audio_quality: provider.audio_quality ?? "good",
          unresolved_items:
            phonemeEvaluation.substitutions +
            phonemeEvaluation.deletions +
            phonemeEvaluation.insertions,
          conflicting_signals: 0,
          verdict_status: finalVerdict,
          review_reasons:
            provider.tajweed_score == null
              ? issueDetected
                ? ["pronunciation_issue_requires_teacher_review", "tajweed_rule_detector_not_connected"]
                : ["tajweed_rule_detector_not_connected"]
              : review.reasons,
          summary: {
            ...(provider.summary ?? {}),
            phoneme_reference_version: referenceVersion,
            pronunciation: {
              score: phonemeEvaluation.score,
              distance: phonemeEvaluation.distance,
              matched_count: phonemeEvaluation.matched_count,
              substitutions: phonemeEvaluation.substitutions,
              deletions: phonemeEvaluation.deletions,
              insertions: phonemeEvaluation.insertions,
            },
          },
          evidence: [
            ...(provider.evidence ?? []),
            ...phonemeEvaluation.operations
              .filter((operation) => operation.type !== "match")
              .slice(0, 200)
              .map((operation) => ({
                type: "phoneme_error",
                ...operation,
              })),
          ],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "attempt_id,question_id" },
      )
      .select(
        "id,attempt_id,question_id,audio_answer_id,analysis_version,model,pronunciation_score,tajweed_score,confidence,audio_quality,issue_detected,unresolved_items,verdict_status,review_reasons,summary,evidence,created_at,updated_at",
      )
      .single();

    if (analysisError || !analysis) {
      throw new Error(analysisError?.message ?? "Failed to store Tajweed phoneme analysis.");
    }

    return NextResponse.json({
      analysis,
      phonemes: phonemeEvaluation,
      provider: {
        name: provider.provider,
        model: provider.model,
        confidence: provider.confidence,
      },
      review: {
        status: analysis.verdict_status,
        required: analysis.verdict_status === "needs_teacher_review",
        reasons: analysis.review_reasons,
      },
    });
  } catch (error) {
    console.error("Burhan Tajweed phoneme run failed", error);
    return NextResponse.json(
      {
        error: "TAJWEED_PHONEME_RUN_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to run Tajweed phoneme analysis.",
      },
      { status: 500 },
    );
  }
}
