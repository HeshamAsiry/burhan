import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

const querySchema = z.object({
  profile_code: z.string().trim().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    profile_code: url.searchParams.get("profile_code") ?? undefined,
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
      .from("tajweed_madd_profiles")
      .select(
        "profile_code,profile_name_ar,qiraah,riwayah,tariq,rule_code,allowed_harakah,measurement_mode,notes",
      )
      .order("profile_code", { ascending: true })
      .order("rule_code", { ascending: true });

    if (parsed.data.profile_code) {
      query = query.eq("profile_code", parsed.data.profile_code);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      count: data?.length ?? 0,
      profiles: data ?? [],
    });
  } catch (error) {
    console.error("Burhan Tajweed Madd profiles lookup failed", error);
    return NextResponse.json(
      {
        error: "TAJWEED_MADD_PROFILES_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load Tajweed Madd profiles.",
      },
      { status: 500 },
    );
  }
}
