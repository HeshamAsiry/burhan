import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";
import { scoreDifficulty, anchorWordCount } from "./difficulty";

type AyahRef = {
  surah_id: number;
  ayah_number: number;
  text_ar: string;
};

type RangeEndpoint = {
  surah_id: number;
  ayah_number: number;
  anchor?: string;
};

function buildPromptFragment(text: string, side: "start" | "end", maxWords = 6) {
  const words = text.trim().split(/\\s+/).filter(Boolean);
  if (!words.length) return text;

  const count = Math.min(maxWords, words.length);
  if (words.length <= count) {
    const reducedCount = Math.max(1, words.length - 1);
    const reduced =
      side === "start"
        ? words.slice(0, reducedCount).join(" ")
        : words.slice(words.length - reducedCount).join(" ");
    if (words.length === 1) return reduced;
    return side === "start" ? reduced + "…" : "…" + reduced;
  }

  const fragment =
    side === "start"
      ? words.slice(0, count).join(" ")
      : words.slice(words.length - count).join(" ");

  return side === "start" ? fragment + "…" : "…" + fragment;
}

export type GeneratedReciteRangeQuestion = {
  question_type: "recite_range";
  prompt: string;
  expected_answer: {
    start: RangeEndpoint;
    end: RangeEndpoint;
    ayah_count: number;
    ayahs: AyahRef[];
  };
  difficulty: number;
  metadata: {
    juz_start: number | null;
    juz_end: number | null;
    page_start: number | null;
    page_end: number | null;
  };
};

async function resolveEndpoint(endpoint: RangeEndpoint): Promise<RangeEndpoint> {
  const db = getSupabaseAdmin();

  if (endpoint.surah_id && endpoint.ayah_number) {
    const { data, error } = await db
      .from("ayahs")
      .select("surah_id,ayah_number,text_ar")
      .eq("surah_id", endpoint.surah_id)
      .eq("ayah_number", endpoint.ayah_number)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Ayah not found: ${endpoint.surah_id}:${endpoint.ayah_number}`);

    return { surah_id: data.surah_id, ayah_number: data.ayah_number, anchor: endpoint.anchor };
  }

  if (!endpoint.anchor?.trim()) throw new Error("Endpoint requires surah_id + ayah_number or an anchor.");

  const normalized = normalizeArabic(endpoint.anchor);
  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,normalized_text")
    .ilike("normalized_text", `%${normalized}%`)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`No ayah found containing anchor: ${endpoint.anchor}`);

  if (data.length > 1) {
    throw new Error(
      `Anchor is ambiguous: "${endpoint.anchor}" matches ${data.length} ayahs. Provide surah_id and ayah_number.`,
    );
  }

  return {
    surah_id: data[0].surah_id,
    ayah_number: data[0].ayah_number,
    anchor: endpoint.anchor,
  };
}

export async function generateReciteRangeQuestion(input: {
  start: RangeEndpoint;
  end: RangeEndpoint;
}): Promise<GeneratedReciteRangeQuestion> {
  const start = await resolveEndpoint(input.start);
  const end = await resolveEndpoint(input.end);

  if (start.surah_id > end.surah_id || (start.surah_id === end.surah_id && start.ayah_number > end.ayah_number)) {
    throw new Error("Range end must come after range start in Quran order.");
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,text_ar,juz_number,page_number")
    .gte("surah_id", start.surah_id)
    .lte("surah_id", end.surah_id)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<AyahRef & { juz_number: number | null; page_number: number | null }>;
  const ayahs = rows.filter((row) => {
    const afterStart =
      row.surah_id > start.surah_id ||
      (row.surah_id === start.surah_id && row.ayah_number >= start.ayah_number);
    const beforeEnd =
      row.surah_id < end.surah_id ||
      (row.surah_id === end.surah_id && row.ayah_number <= end.ayah_number);
    return afterStart && beforeEnd;
  });

  if (!ayahs.length) throw new Error("No ayahs found for the requested range.");

  const first = ayahs[0];
  const last = ayahs[ayahs.length - 1];
  const difficulty = scoreDifficulty({
    occurrenceCount: 1,
    anchorWordCount: anchorWordCount(normalizeArabic(start.anchor ?? "")),
    anchorCharCount: normalizeArabic(start.anchor ?? "").length,
    requestedAyahs: ayahs.length,
    transitionDistance: last.page_number && first.page_number ? last.page_number - first.page_number : 0,
  });

  const startFragment = buildPromptFragment(first.text_ar, "start");
  const endFragment = buildPromptFragment(last.text_ar, "end");
  const startLabel = `قوله تعالى: «${startFragment}»`;
  const endLabel = `قوله تعالى: «${endFragment}»`;

  return {
    question_type: "recite_range",
    prompt: `ابدأ من ${startLabel} حتى ${endLabel}`,
    expected_answer: {
      start,
      end,
      ayah_count: ayahs.length,
      ayahs: ayahs.map(({ surah_id, ayah_number, text_ar }) => ({ surah_id, ayah_number, text_ar })),
    },
    difficulty,
    metadata: {
      juz_start: first.juz_number,
      juz_end: last.juz_number,
      page_start: first.page_number,
      page_end: last.page_number,
    },
  };
}
