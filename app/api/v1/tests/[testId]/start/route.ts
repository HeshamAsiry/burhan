import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../../lib/supabase-admin";

const schema = z.object({
  external_user_id: z.string().trim().min(1).max(200).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ testId: string }> },
) {
  const { testId } = await context.params;
  if (!z.string().uuid().safeParse(testId).success) {
    return NextResponse.json({ error: "INVALID_TEST_ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
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

    const { data: attempt, error: attemptError } = await db
      .from("test_attempts")
      .insert({
        test_id: testId,
        external_user_id: parsed.data.external_user_id ?? null,
        started_at: new Date().toISOString(),
      })
      .select("id,test_id,external_user_id,started_at,submitted_at,score,mastery,result")
      .single();

    if (attemptError || !attempt) {
      throw new Error(attemptError?.message ?? "Failed to start attempt.");
    }

    return NextResponse.json({
      attempt_id: attempt.id,
      started_at: attempt.started_at,
      test: {
        id: test.id,
        level: test.level,
        test_type: test.test_type,
        juz: test.juz_number,
      },
    });
  } catch (error) {
    console.error("Burhan test attempt start failed", error);
    return NextResponse.json(
      {
        error: "ATTEMPT_START_ERROR",
        message: error instanceof Error ? error.message : "Unable to start test attempt.",
      },
      { status: 500 },
    );
  }
}
