import { NextResponse } from "next/server";
import { z } from "zod";
import { generateMutashabihatQuestion } from "../../../../../lib/burhan/question-generator";

const schema = z.object({
  anchor: z.string().min(1).max(120),
  occurrences_required: z.union([z.literal("all"), z.number().int().min(1).max(10)]).default(2),
  ayahs_after: z.number().int().min(0).max(5).default(1),
  threshold: z.number().min(0.2).max(0.95).optional(),
  limit: z.number().int().min(2).max(50).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await generateMutashabihatQuestion({
      anchor: parsed.data.anchor,
      occurrencesRequired: parsed.data.occurrences_required,
      ayahsAfter: parsed.data.ayahs_after,
      threshold: parsed.data.threshold,
      limit: parsed.data.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Burhan mutashabihat generation failed", error);
    return NextResponse.json(
      { error: "QUESTION_GENERATION_ERROR", message: error instanceof Error ? error.message : "Unable to generate question." },
      { status: 500 },
    );
  }
}
