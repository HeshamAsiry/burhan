import { NextResponse } from "next/server";
import { z } from "zod";
import { generateReciteRangeQuestion } from "../../../../../lib/burhan/recite-range-generator";

const endpointSchema = z.object({
  surah_id: z.number().int().min(1).max(114).optional(),
  ayah_number: z.number().int().min(1).optional(),
  anchor: z.string().min(1).max(120).optional(),
}).refine((value) => (value.surah_id && value.ayah_number) || value.anchor, {
  message: "Provide surah_id + ayah_number or anchor.",
});

const schema = z.object({
  start: endpointSchema,
  end: endpointSchema,
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const toEndpoint = (endpoint: typeof parsed.data.start) => {
      if (endpoint.surah_id != null && endpoint.ayah_number != null) {
        return {
          surah_id: endpoint.surah_id,
          ayah_number: endpoint.ayah_number,
          anchor: endpoint.anchor,
        };
      }

      if (endpoint.anchor) {
        return {
          surah_id: 1,
          ayah_number: 1,
          anchor: endpoint.anchor,
        };
      }

      throw new Error("Invalid range endpoint.");
    };

    const result = await generateReciteRangeQuestion({
      start: toEndpoint(parsed.data.start),
      end: toEndpoint(parsed.data.end),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Burhan recite-range generation failed", error);
    return NextResponse.json(
      {
        error: "QUESTION_GENERATION_ERROR",
        message: error instanceof Error ? error.message : "Unable to generate question.",
      },
      { status: 500 },
    );
  }
}
