import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../lib/supabase-admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ testId: string }> },
) {
  const { params } = await Promise.resolve(context);
  const parsed = z.string().uuid().safeParse(params.testId);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_TEST_ID" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    const { data: attempts, error: attemptError } = await db
      .from("test_attempts")
      .select("id,test_id,external_user_id,started_at,submitted_at,score,mastery,result,created_at")
      .eq("test_id", parsed.data)
      .order("created_at", { ascending: false });

    if (attemptError) throw new Error(attemptError.message);

    return NextResponse.json({
      test_id: parsed.data,
      attempts: attempts ?? [],
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
