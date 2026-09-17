import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSimilarityFamilies } from "../../../../../lib/burhan/similarity-family-engine";

const schema = z.object({
  anchor: z.string().min(1).max(120),
  threshold: z.number().min(0.2).max(0.95).optional(),
  limit: z.number().int().min(2).max(50).optional(),
  persist: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const result = await buildSimilarityFamilies(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
