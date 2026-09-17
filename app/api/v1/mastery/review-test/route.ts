import { NextResponse } from "next/server";
import { z } from "zod";
import { getReviewQueue } from "../../../../../lib/burhan/mastery-engine";
import { generateTest } from "../../../../../lib/burhan/test-generator";

const schema = z.object({
  external_user_id: z.string().trim().min(1).max(200),
  level: z.number().int().min(1).max(7).default(3),
  question_count: z.number().int().min(1).max(50).default(10),
  persist: z.boolean().default(true),
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
    const queue = await getReviewQueue({
      externalUserId: parsed.data.external_user_id,
      limit: parsed.data.question_count,
    });

    if (!queue.length) {
      return NextResponse.json({
        status: "empty",
        message: "No review items are due.",
        external_user_id: parsed.data.external_user_id,
        questions: [],
      });
    }

    const questions = queue
      .map((item: any) => {
        const ayah = Array.isArray(item.ayahs) ? item.ayahs[0] : item.ayahs;
        if (!ayah?.surah_id || !ayah?.ayah_number) return null;

        return {
          type: "recite_range" as const,
          start: {
            surah_id: Number(ayah.surah_id),
            ayah_number: Number(ayah.ayah_number),
          },
          end: {
            surah_id: Number(ayah.surah_id),
            ayah_number: Number(ayah.ayah_number),
          },
        };
      })
      .filter(Boolean);

    if (!questions.length) {
      return NextResponse.json({
        status: "empty",
        message: "Review items were found but could not be converted to questions.",
        external_user_id: parsed.data.external_user_id,
        questions: [],
      });
    }

    const test = await generateTest({
      juz: Number((queue[0] as any).ayahs?.juz_number ?? (Array.isArray((queue[0] as any).ayahs) ? (queue[0] as any).ayahs[0]?.juz_number : undefined) ?? 1),
      level: parsed.data.level,
      testType: "custom",
      questions: questions as any,
      persist: parsed.data.persist,
    });

    return NextResponse.json({
      status: "generated",
      external_user_id: parsed.data.external_user_id,
      source: "mastery_review_queue",
      reviewed_items: questions.length,
      test,
    });
  } catch (error) {
    console.error("Burhan review test generation failed", error);
    return NextResponse.json(
      {
        error: "REVIEW_TEST_ERROR",
        message: error instanceof Error ? error.message : "Unable to generate review test.",
      },
      { status: 500 },
    );
  }
}
