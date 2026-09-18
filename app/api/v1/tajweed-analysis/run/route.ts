import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../lib/supabase-admin";
import { comparePhonemes } from "../../../../../lib/burhan/phoneme-evaluator";
import {
  evaluateMaddObservations,
  summarizeMaddMeasurements,
} from "../../../../../lib/burhan/madd-acoustic-evaluator";
import { decideTeacherReview } from "../../../../../lib/burhan/teacher-review";
import { runPhonemeProvider } from "../../../../../lib/burhan/phoneme-provider";
import { runMaddAcousticProvider } from "../../../../../lib/burhan/madd-acoustic-provider";
import { mapCharRangeToPhonemeSpan } from "../../../../../lib/burhan/phoneme-reference-map";
import {
  buildPhonemeErrorEvidence,
  buildPhonemeReferenceSegments,
  summarizePhonemeErrorsByAyah,
} from "../../../../../lib/burhan/phoneme-evidence";

const schema = z.object({
  attempt_id: z.string().uuid(),
  question_id: z.string().uuid(),
  audio_url: z.string().url(),
  profile_code: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("hafs_asim_baseline_v1"),
});

type AyahCoordinate = {
  surah_id: number;
  ayah_number: number;
};

function collectExpectedAyahRefs(
  value: unknown,
  output: Map<string, AyahCoordinate> = new Map<string, AyahCoordinate>(),
): AyahCoordinate[] {
  if (Array.isArray(value)) {
    for (const item of value) collectExpectedAyahRefs(item, output);
    return Array.from(output.values());
  }

  if (!value || typeof value !== "object") return Array.from(output.values());

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

  return Array.from(output.values());
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
          .select("id,test_id,question_type,expected_answer")
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
    const candidateByKey = new Map(
      (candidateAyahs ?? []).map((ayah) => [
        ayah.surah_id + ":" + ayah.ayah_number,
        ayah,
      ]),
    );

    const orderedAyahs = expectedAyahRefs
      .map((ref) => candidateByKey.get(ref.surah_id + ":" + ref.ayah_number))
      .filter(
        (ayah): ayah is (typeof candidateAyahs extends Array<infer Item> ? Item : never) =>
          Boolean(ayah),
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
      .select(
        "ayah_id,phoneme_version,phonemes,letter_phoneme_mappings,tajweed_mappings",
      )
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

    const referencePhonemeOffsetByAyah = new Map<string, number>();
    const referencePhonemes: string[] = [];

    for (const ayah of orderedAyahs) {
      const reference = referenceByAyah.get(ayah.id);
      const value = reference?.phonemes;

      if (!reference || !Array.isArray(value) || !value.length) {
        throw new Error("Invalid phoneme reference for ayah " + ayah.id);
      }

      referencePhonemeOffsetByAyah.set(ayah.id, referencePhonemes.length);
      referencePhonemes.push(...value.map((phoneme) => String(phoneme)));
    }

    const referenceVersion = [
      ...new Set(
        (references ?? []).map((row) => String(row.phoneme_version)),
      ),
    ].join(",");

    const profileCode = parsed.data.profile_code;

    const { data: tajweedOccurrences, error: tajweedError } = await db
      .from("tajweed_occurrences")
      .select(
        "id,ayah_id,rule_id,word_index,word_index_end,char_start,char_end,trigger_text,context_text,expected_behavior,rule:tajweed_rules!inner(code,name_ar,name_en,category)",
      )
      .in(
        "ayah_id",
        orderedAyahs.map((ayah) => ayah.id),
      )
      .order("ayah_id", { ascending: true })
      .order("word_index", { ascending: true })
      .order("char_start", { ascending: true });

    if (tajweedError) throw new Error(tajweedError.message);

    const maddOccurrences = (tajweedOccurrences ?? []).filter(
      (item: any) => typeof item.rule?.code === "string" && item.rule.code.startsWith("madd_"),
    );

    const maddRuleCodes = [
      ...new Set(
        (maddOccurrences ?? [])
          .map((item: any) => item.rule?.code)
          .filter((code: unknown): code is string => typeof code === "string"),
      ),
    ];

    const { data: maddProfiles, error: maddProfileError } = maddRuleCodes.length
      ? await db
          .from("tajweed_madd_profiles")
          .select(
            "profile_code,profile_name_ar,qiraah,riwayah,tariq,rule_code,allowed_harakah,measurement_mode,notes",
          )
          .eq("profile_code", profileCode)
          .in("rule_code", maddRuleCodes)
      : { data: [], error: null };

    if (maddProfileError) throw new Error(maddProfileError.message);

    const profileByRule = new Map(
      (maddProfiles ?? []).map((item: any) => [item.rule_code, item]),
    );

    const maddTargets: import("../../../../../lib/burhan/madd-acoustic-evaluator").MaddTarget[] = (maddOccurrences ?? []).map((occurrence: any) => {
      const profile = profileByRule.get(occurrence.rule.code);
      const expectedBehavior = occurrence.expected_behavior ?? {};

      const reference = referenceByAyah.get(occurrence.ayah_id);
      const phonemeOffset =
        referencePhonemeOffsetByAyah.get(occurrence.ayah_id) ?? 0;
      const phonemeSpan =
        reference &&
        mapCharRangeToPhonemeSpan(
          reference,
          Number(occurrence.char_start),
          Number(occurrence.char_end),
          phonemeOffset,
        );

      return {
        occurrence_id: occurrence.id,
        rule_code: occurrence.rule.code,
        expected_harakah: Array.isArray(profile?.allowed_harakah)
          ? profile.allowed_harakah.map((value: unknown) => Number(value)).filter(Number.isFinite)
          : [],
        measurement_mode:
          profile?.measurement_mode ?? "route_profile",
        condition:
          expectedBehavior.condition === "waqf"
            ? ("waqf" as const)
            : ("always" as const),
        requires_stop: expectedBehavior.condition === "waqf",
        notes: profile?.notes ?? null,
        ayah_id: occurrence.ayah_id,
        char_start: Number(occurrence.char_start),
        char_end: Number(occurrence.char_end),
        phoneme_start: phonemeSpan?.start,
        phoneme_end: phonemeSpan?.end,
      };
    });

    const provider = await runPhonemeProvider({
      audioUrl: parsed.data.audio_url,
      referencePhonemes,
      questionId: question.id,
      maddTargets,
    });

    const phonemeEvaluation = comparePhonemes(
      referencePhonemes,
      provider.predicted_phonemes,
    );

    const referenceSegments = buildPhonemeReferenceSegments({
      orderedAyahs,
      referenceByAyah,
    });

    const phonemeErrorEvidence = buildPhonemeErrorEvidence({
      operations: phonemeEvaluation.operations,
      segments: referenceSegments,
      tajweedOccurrences: (tajweedOccurrences ?? []).map((item: any) => ({
        occurrence_id: String(item.id),
        ayah_id: String(item.ayah_id),
        rule_code: String(item.rule?.code ?? ""),
        char_start: item.char_start == null ? null : Number(item.char_start),
        char_end: item.char_end == null ? null : Number(item.char_end),
        word_index: item.word_index == null ? null : Number(item.word_index),
        word_index_end:
          item.word_index_end == null ? null : Number(item.word_index_end),
      })),
    });

    const phonemeErrorsByAyah = summarizePhonemeErrorsByAyah(
      phonemeErrorEvidence,
    );

    const hasDedicatedMaddProvider =
      Boolean(process.env.BURHAN_MADD_ACOUSTIC_PROVIDER_URL?.trim());

    const dedicatedMaddProvider = hasDedicatedMaddProvider
      ? await runMaddAcousticProvider({
          audioUrl: parsed.data.audio_url,
          questionId: question.id,
          targets: maddTargets,
        })
      : null;

    const maddObservations =
      dedicatedMaddProvider?.observations ??
      provider.madd_observations ??
      [];

    const maddMeasurements = evaluateMaddObservations(
      maddTargets,
      maddObservations,
    );
    const maddSummary = summarizeMaddMeasurements(maddMeasurements);
    const measuredMadd = maddMeasurements.filter(
      (item) => item.observed_duration_ms != null,
    );
    const missingExpectedMadd =
      maddTargets.length > 0 &&
      (provider.madd_observations?.length ?? 0) < maddTargets.length;

    const issueDetected =
      provider.issue_detected ??
      (phonemeEvaluation.score < 95 || maddSummary.detected_issues > 0);

    const maddForcesReview =
      maddSummary.needs_teacher_review > 0 ||
      (missingExpectedMadd && measuredMadd.length > 0);

    const finalVerdict =
      maddTargets.length === 0 && provider.tajweed_score == null
        ? (issueDetected ? "needs_teacher_review" : "not_assessed")
        : provider.tajweed_score == null && maddSummary.detected_issues === 0
          ? (maddForcesReview ? "needs_teacher_review" : "not_assessed")
          : maddForcesReview
            ? "needs_teacher_review"
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
        phonemeEvaluation.insertions +
        maddSummary.needs_teacher_review +
        maddSummary.not_assessed,
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
            madd_summary: maddSummary,
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
            phonemeEvaluation.insertions +
            maddSummary.needs_teacher_review +
            maddSummary.not_assessed,
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
            madd: {
              ...maddSummary,
              provider: dedicatedMaddProvider?.provider ?? null,
              model: dedicatedMaddProvider?.model ?? null,
              provider_confidence: dedicatedMaddProvider?.confidence ?? null,
            },
            pronunciation: {
              score: phonemeEvaluation.score,
              distance: phonemeEvaluation.distance,
              matched_count: phonemeEvaluation.matched_count,
              substitutions: phonemeEvaluation.substitutions,
              deletions: phonemeEvaluation.deletions,
              insertions: phonemeEvaluation.insertions,
              errors_by_ayah: phonemeErrorsByAyah,
            },
          },
          evidence: [
            ...(provider.evidence ?? []),
            ...phonemeErrorEvidence.slice(0, 200),
            ...maddMeasurements
              .filter((item) => item.status !== "verified")
              .map((item) => ({
                type: "madd_measurement",
                occurrence_id: item.occurrence_id,
                rule_code: item.rule_code,
                status: item.status,
                estimated_harakah: item.estimated_harakah,
                expected_harakah: item.expected_harakah,
                deviation_percent: item.deviation_percent,
                reasons: item.reasons,
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

    const measurementRows = maddMeasurements.map((measurement) => {
      const observation = (provider.madd_observations ?? []).find(
        (item) => item.occurrence_id === measurement.occurrence_id,
      );
      const target = maddTargets.find(
        (item) => item.occurrence_id === measurement.occurrence_id,
      );

      return {
        analysis_id: analysis.id,
        occurrence_id: measurement.occurrence_id,
        profile_code: profileCode,
        rule_code: measurement.rule_code,
        observed_duration_ms: measurement.observed_duration_ms,
        reference_harakah_ms: measurement.reference_harakah_ms,
        estimated_harakah: measurement.estimated_harakah,
        expected_harakah: measurement.expected_harakah,
        deviation_percent: measurement.deviation_percent,
        measurement_confidence: measurement.measurement_confidence,
        stop_detected: measurement.stop_detected,
        status: measurement.status,
        reasons: measurement.reasons,
        evidence: {
          ...measurement.evidence,
          provider_start_ms: observation?.start_ms ?? null,
          provider_end_ms: observation?.end_ms ?? null,
          measurement_mode: target?.measurement_mode ?? null,
        },
      };
    });

    if (measurementRows.length) {
      const { error: measurementsError } = await db
        .from("burhan_madd_measurements")
        .upsert(measurementRows, { onConflict: "analysis_id,occurrence_id" });

      if (measurementsError) {
        throw new Error(measurementsError.message);
      }
    }

    return NextResponse.json({
      analysis,
      phonemes: phonemeEvaluation,
      madd: {
        summary: maddSummary,
        measurements: maddMeasurements,
      },
      provider: {
        name: provider.provider,
        model: provider.model,
        confidence: provider.confidence,
      },
      madd_provider: dedicatedMaddProvider
        ? {
            name: dedicatedMaddProvider.provider,
            model: dedicatedMaddProvider.model,
            confidence: dedicatedMaddProvider.confidence,
          }
        : null,
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
