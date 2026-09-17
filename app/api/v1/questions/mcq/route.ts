import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSurahMcqQuestion } from "../../../../../lib/burhan/mcq-generator";

const schema = z.object({
  anchor: z.string().min(1).max(120).optional(),
  surah_id: z.number().int().min(1).max(114).optional(),
  ayah_number: z.number().int().min(1).optional(),
}).refine(
  (value) => Boolean(value.anchor) || (value.surah_id != null && value.ayah_number != null),
  { message: "Provide anchor or surah_id + ayah_number." },
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
    const result = await generateSurahMcqQuestion({
      anchor: parsed.data.anchor,
      surahId: parsed.data.surah_id,
      ayahNumber: parsed.data.ayah_number,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Burhan MCQ generation failed", error);
    return NextResponse.json(
      {
        error: "QUESTION_GENERATION_ERROR",
        message: error instanceof Error ? error.message : "Unable to generate MCQ question.",
      },
      { status: 500 },
    );
  }
}
