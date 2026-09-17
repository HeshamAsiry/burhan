import { NextResponse } from "next/server";
import { z } from "zod";
import { findAnchorRecall } from "../../../../../lib/burhan/anchor-engine";

const schema = z.object({
  anchor: z.string().min(1).max(120),
  occurrences_required: z.union([z.literal("all"), z.number().int().min(1).max(100)]),
  ayahs_after: z.number().int().min(0).max(10).default(1),
  juz: z.number().int().min(1).max(30).optional(),
});

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
    const result = await findAnchorRecall({
      anchor: parsed.data.anchor,
      occurrencesRequired: parsed.data.occurrences_required,
      ayahsAfter: parsed.data.ayahs_after,
      juz: parsed.data.juz,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Burhan anchor recall failed", error);
    return NextResponse.json(
      { error: "ENGINE_ERROR", message: "Unable to generate anchor recall." },
      { status: 500 },
    );
  }
}
