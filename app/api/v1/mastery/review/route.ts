import { NextResponse } from "next/server";
import { z } from "zod";
import { getReviewQueue } from "../../../../../lib/burhan/mastery-engine";

const schema = z.object({
  external_user_id: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse({
    external_user_id: url.searchParams.get("external_user_id"),
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const items = await getReviewQueue({
      externalUserId: parsed.data.external_user_id,
      limit: parsed.data.limit,
    });

    return NextResponse.json({
      external_user_id: parsed.data.external_user_id,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("Burhan mastery review queue failed", error);
    return NextResponse.json(
      {
        error: "MASTERY_QUEUE_ERROR",
        message: error instanceof Error ? error.message : "Unable to load review queue.",
      },
      { status: 500 },
    );
  }
}
