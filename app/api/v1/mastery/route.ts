import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../lib/supabase-admin";

const schema = z.object({
  external_user_id: z.string().trim().min(1).max(200),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse({
    external_user_id: url.searchParams.get("external_user_id"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("burhan_mastery")
      .select("mastery,last_score,last_status,attempt_count,next_review_at")
      .eq("external_user_id", parsed.data.external_user_id);

    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const averageMastery = rows.length
      ? Number((rows.reduce((sum, row) => sum + Number(row.mastery ?? 0), 0) / rows.length).toFixed(2))
      : 0;

    const now = Date.now();
    const due = rows.filter((row) => row.next_review_at && new Date(row.next_review_at).getTime() <= now).length;
    const weak = rows.filter((row) => Number(row.mastery ?? 0) < 70).length;
    const strong = rows.filter((row) => Number(row.mastery ?? 0) >= 95).length;
    const attempts = rows.reduce((sum, row) => sum + Number(row.attempt_count ?? 0), 0);

    return NextResponse.json({
      external_user_id: parsed.data.external_user_id,
      tracked_ayahs: rows.length,
      average_mastery: averageMastery,
      due_for_review: due,
      weak_ayahs: weak,
      mastered_ayahs: strong,
      total_ayah_attempts: attempts,
    });
  } catch (error) {
    console.error("Burhan mastery summary failed", error);
    return NextResponse.json(
      {
        error: "MASTERY_SUMMARY_ERROR",
        message: error instanceof Error ? error.message : "Unable to load mastery summary.",
      },
      { status: 500 },
    );
  }
}
