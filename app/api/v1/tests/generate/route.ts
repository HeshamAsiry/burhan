import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTest } from "../../../../../lib/burhan/test-generator";

const endpoint = z.object({ surah_id: z.number().int().min(1).max(114), ayah_number: z.number().int().min(1), anchor: z.string().max(120).optional() });
const question = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mutashabihat"), anchor: z.string().min(1).max(120), occurrences_required: z.union([z.literal("all"), z.number().int().min(1).max(10)]).optional(), ayahs_after: z.number().int().min(0).max(5).optional(), threshold: z.number().min(0.2).max(0.95).optional(), limit: z.number().int().min(2).max(50).optional() }),
  z.object({ type: z.literal("recite_range"), start: endpoint, end: endpoint }),
]);
const schema = z.object({ juz: z.number().int().min(1).max(30), level: z.number().int().min(1).max(7), test_type: z.enum(["non_cumulative","cumulative","custom"]).default("custom"), persist: z.boolean().default(true), question_count: z.number().int().min(1).max(100).optional(), questions: z.array(question).min(1).max(100).optional() }).refine((value) => Boolean(value.questions?.length) || Boolean(value.question_count), { message: "Provide questions or question_count." });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json(await generateTest({ juz: parsed.data.juz, level: parsed.data.level, testType: parsed.data.test_type, persist: parsed.data.persist, questionCount: parsed.data.question_count, questions: parsed.data.questions }));
  } catch (error) {
    console.error("Burhan test generation failed", error);
    return NextResponse.json({ error: "TEST_GENERATION_ERROR", message: error instanceof Error ? error.message : "Unable to generate test." }, { status: 500 });
  }
}
