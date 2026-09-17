import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../../lib/supabase-admin";

const schema = z.object({
  status: z.enum(["confirmed", "rejected", "unclear"]),
  reviewer_external_id: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(5000).optional(),
  final_score: z.number().min(0).max(100).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ analysisId: string }> },
) {
  const { analysisId } = await context.params;

  if (!z.string().uuid().safeParse(analysisId).success) {
    return NextResponse.json({ error: "INVALID_ANALYSIS_ID" }, { status: 400 });
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

    const { data: analysis, error: analysisError } = await db
      .from("burhan_tajweed_analyses")
      .select("id,verdict_status")
      .eq("id", analysisId)
      .maybeSingle();

    if (analysisError) throw new Error(analysisError.message);
    if (!analysis) {
      return NextResponse.json({ error: "TAJWEED_ANALYSIS_NOT_FOUND" }, { status: 404 });
    }

    const finalVerdict =
      parsed.data.status === "confirmed"
        ? "detected_issue"
        : parsed.data.status === "rejected"
          ? "verified"
          : "needs_teacher_review";

    const { data: review, error: reviewError } = await db
      .from("burhan_teacher_reviews")
      .upsert(
        {
          tajweed_analysis_id: analysis.id,
          status: parsed.data.status,
          reviewer_external_id: parsed.data.reviewer_external_id ?? null,
          notes: parsed.data.notes ?? null,
          final_score: parsed.data.final_score ?? null,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "tajweed_analysis_id" },
      )
      .select("id,tajweed_analysis_id,status,reviewer_external_id,notes,final_score,reviewed_at,created_at")
      .single();

    if (reviewError || !review) {
      throw new Error(reviewError?.message ?? "Failed to store teacher review.");
    }

    const { data: updatedAnalysis, error: updateError } = await db
      .from("burhan_tajweed_analyses")
      .update({
        verdict_status: finalVerdict,
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysis.id)
      .select("id,verdict_status,tajweed_score,confidence,review_reasons,updated_at")
      .single();

    if (updateError || !updatedAnalysis) {
      throw new Error(updateError?.message ?? "Failed to update analysis verdict.");
    }

    return NextResponse.json({
      analysis: updatedAnalysis,
      teacher_review: review,
    });
  } catch (error) {
    console.error("Burhan teacher review failed", error);
    return NextResponse.json(
      {
        error: "TEACHER_REVIEW_ERROR",
        message: error instanceof Error ? error.message : "Unable to store teacher review.",
      },
      { status: 500 },
    );
  }
}
