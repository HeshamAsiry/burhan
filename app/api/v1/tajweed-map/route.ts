import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

const querySchema = z
  .object({
    ayah_id: z.string().uuid().optional(),
    surah_id: z.coerce.number().int().min(1).max(114).optional(),
    ayah_number: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (value) =>
      Boolean(value.ayah_id) ||
      (value.surah_id != null && value.ayah_number != null),
    { message: "Provide ayah_id or surah_id + ayah_number." },
  );

export async function GET(request: Request) {
  const url = new URL(request.url);

  const parsed = querySchema.safeParse({
    ayah_id: url.searchParams.get("ayah_id") ?? undefined,
    surah_id: url.searchParams.get("surah_id") ?? undefined,
    ayah_number: url.searchParams.get("ayah_number") ?? undefined,
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

    let ayahQuery = db
      .from("ayahs")
      .select("id,surah_id,ayah_number,text_ar,juz_number,page_number");

    if (parsed.data.ayah_id) {
      ayahQuery = ayahQuery.eq("id", parsed.data.ayah_id);
    } else {
      ayahQuery = ayahQuery
        .eq("surah_id", parsed.data.surah_id!)
        .eq("ayah_number", parsed.data.ayah_number!);
    }

    const { data: ayahs, error: ayahError } = await ayahQuery.limit(1);
    if (ayahError) throw new Error(ayahError.message);
    if (!ayahs?.length) {
      return NextResponse.json({ error: "AYAH_NOT_FOUND" }, { status: 404 });
    }

    const ayah = ayahs[0];

    const { data: occurrences, error: occurrenceError } = await db
      .from("tajweed_occurrences")
      .select(
        "id,word_index,word_index_end,trigger_text,context_text,expected_behavior,source_version,rule:tajweed_rules(id,code,name_ar,name_en,category,detection_mode)",
      )
      .eq("ayah_id", ayah.id)
      .order("word_index", { ascending: true })
      .limit(parsed.data.limit);

    if (occurrenceError) throw new Error(occurrenceError.message);

    return NextResponse.json({
      ayah: {
        id: ayah.id,
        surah_id: ayah.surah_id,
        ayah_number: ayah.ayah_number,
        text_ar: ayah.text_ar,
        juz_number: ayah.juz_number,
        page_number: ayah.page_number,
      },
      count: occurrences?.length ?? 0,
      occurrences: occurrences ?? [],
      note:
        "This is the expected Tajweed knowledge map. It does not by itself judge the learner's audio pronunciation.",
    });
  } catch (error) {
    console.error("Burhan Tajweed map lookup failed", error);
    return NextResponse.json(
      {
        error: "TAJWEED_MAP_ERROR",
        message: error instanceof Error ? error.message : "Unable to load Tajweed map.",
      },
      { status: 500 },
    );
  }
}
