import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../../lib/supabase-admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ testId: string }> },
) {
  const { testId } = await context.params;
  const parsed = z.string().uuid().safeParse(testId);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_TEST_ID" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    const url = new URL(_request.url);
    const attemptId = url.searchParams.get("attempt_id");

    let query = db
      .from("test_attempts")
      .select("id,test_id,external_user_id,started_at,submitted_at,score,mastery,result,created_at")
      .eq("test_id", parsed.data)
      .order("created_at", { ascending: false });

    if (attemptId) query = query.eq("id", attemptId);

    const { data: attempts, error: attemptError } = await query;
    if (attemptError) throw new Error(attemptError.message);

    const attemptIds = (attempts ?? []).map((attempt: any) => attempt.id);
    const { data: tajweedAnalyses, error: tajweedError } = attemptIds.length
      ? await db
          .from("burhan_tajweed_analyses")
          .select("id,attempt_id,question_id,audio_answer_id,tajweed_score,pronunciation_score,confidence,issue_detected,audio_quality,verdict_status,review_reasons,summary,evidence,teacher_review:burhan_teacher_reviews(id,status,reviewer_external_id,notes,final_score,reviewed_at),madd_measurements:burhan_madd_measurements(id,occurrence_id,profile_code,rule_code,observed_duration_ms,reference_harakah_ms,estimated_harakah,expected_harakah,deviation_percent,measurement_confidence,stop_detected,status,reasons,evidence)")
          .in("attempt_id", attemptIds)
      : { data: [], error: null };

    if (tajweedError) throw new Error(tajweedError.message);

    const analysesByAttempt = new Map<string, any[]>();
    for (const analysis of tajweedAnalyses ?? []) {
      const list = analysesByAttempt.get(analysis.attempt_id) ?? [];
      list.push(analysis);
      analysesByAttempt.set(analysis.attempt_id, list);
    }

    const enriched = (attempts ?? []).map((attempt: any) => {
      const analyses = analysesByAttempt.get(attempt.id) ?? [];
      return {
        ...attempt,
        duration_seconds: attempt.started_at && attempt.submitted_at
          ? Math.max(0, Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000))
          : null,
        tajweed: {
          analyzed: analyses.length,
          needs_teacher_review: analyses.filter((item) => item.verdict_status === "needs_teacher_review").length,
          detected_issues: analyses.filter((item) => item.verdict_status === "detected_issue").length,
          verified: analyses.filter((item) => item.verdict_status === "verified").length,
          analyses,
        },
      };
    });

    return NextResponse.json({
      test_id: parsed.data,
      attempt_id: attemptId,
      attempts: enriched,
    });
  } catch (error) {
    console.error("Burhan test results failed", error);
    return NextResponse.json(
      {
        error: "RESULTS_ERROR",
        message: error instanceof Error ? error.message : "Unable to load test results.",
      },
      { status: 500 },
    );
  }
}
