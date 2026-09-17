import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAnchorRecallQuestion } from "../../../../../lib/burhan/anchor-recall-generator";

const schema = z.object({
  anchor: z.string().min(1).max(120),
  occurrences_required: z.union([z.literal("all"), z.number().int().min(1).max(100)]).default(1),
  ayahs_after: z.number().int().min(0).max(10).default(1),
  juz_min: z.number().int().min(1).max(30).optional(),
  juz_max: z.number().int().min(1).max(30).optional(),
  include_surah: z.boolean().default(false),
}).refine(
  (value) => value.juz_min === undefined || value.juz_max === undefined || value.juz_min <= value.juz_max,
  { message: "juz_min must be less than or equal to juz_max." },
);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await generateAnchorRecallQuestion({
      anchor: parsed.data.anchor,
      occurrencesRequired: parsed.data.occurrences_required,
      ayahsAfter: parsed.data.ayahs_after,
      juzMin: parsed.data.juz_min,
      juzMax: parsed.data.juz_max,
      includeSurah: parsed.data.include_surah,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Burhan anchor recall question failed", error);
    return NextResponse.json(
      { error: "QUESTION_GENERATION_ERROR", message: error instanceof Error ? error.message : "Unable to generate anchor recall question." },
      { status: 500 },
    );
  }
}
