import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  juz: z.number().int().min(1).max(30),
  type: z.enum(["non_cumulative", "cumulative", "custom"]),
  level: z.number().int().min(1).max(7),
  questions: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      status: "not_ready",
      message: "The Burhan question engine is being initialized.",
      request: parsed.data,
    },
    { status: 501 },
  );
}
