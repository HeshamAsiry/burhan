import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

const querySchema = z.object({
  status: z.enum(["needs_teacher_review", "all"]).default("needs_teacher_review"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_QUERY", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const db = getSupabaseAdmin();

    let query = db
      .from("burhan_tajweed_analyses")
      .select(
        "id,attempt_id,question_id,audio_answer_id,analysis_version,model,pronunciation_score,tajweed_score,confidence,issue_detected,audio_quality,unresolved_items,conflicting_signals,verdict_status,review_reasons,summary,evidence,created_at,updated_at,question:test_questions(id,test_id,position,question_type),audio:burhan_audio_answers(id,audio_url,duration_ms,mime_type,transcript,transcription_provider,transcription_confidence),teacher_review:burhan_teacher_reviews(id,status,reviewer_external_id,notes,final_score,reviewed_at)",
      )
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit);

    if (parsed.data.status !== "all") {
      query = query.eq("verdict_status", "needs_teacher_review");
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      count: data?.length ?? 0,
      reviews: data ?? [],
    });
  } catch (error) {
    console.error("Burhan teacher review queue failed", error);
    return NextResponse.json(
      {
        error: "TEACHER_REVIEW_QUEUE_ERROR",
        message: error instanceof Error ? error.message : "Unable to load teacher review queue.",
      },
      { status: 500 },
    );
  }
}
