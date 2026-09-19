import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";
import { scoreDifficulty, anchorWordCount } from "./difficulty";

type Ayah = {
  surah_id: number;
  ayah_number: number;
  text_ar: string;
  normalized_text: string;
};

type Candidate = {
  anchor: string;
  occurrences: Array<{ surah_id: number; ayah_number: number; text_ar: string }>;
};

function words(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean);
}

function buildCandidates(ayahs: Ayah[], minWords = 2, maxWords = 4) {
  const buckets = new Map<string, Candidate>();
  const common = new Set(["من","في","ما","و","وهو","إن","أن","الذي","الذين","هذا","هذه","ثم","قد","لا","لم","لن"]);

  for (const ayah of ayahs) {
    const sourceWords = words(ayah.normalized_text);
    if (sourceWords.length < minWords) continue;
    const originalWords = words(ayah.text_ar);

    for (let length = maxWords; length >= minWords; length--) {
      for (let index = 0; index + length <= sourceWords.length; index++) {
        const normalized = sourceWords.slice(index, index + length).join(" ");
        const first = sourceWords[index];
        if (length === minWords && common.has(first)) continue;
        if (normalized.length < 6) continue;

        const occurrence = { surah_id: Number(ayah.surah_id), ayah_number: Number(ayah.ayah_number), text_ar: ayah.text_ar };
        const existing = buckets.get(normalized);

        if (!existing) {
          const anchor = originalWords.slice(index, index + length).join(" ");
          buckets.set(normalized, { anchor, occurrences: [occurrence] });
        } else if (!existing.occurrences.some((item) => item.surah_id === occurrence.surah_id && item.ayah_number === occurrence.ayah_number)) {
          existing.occurrences.push(occurrence);
        }
      }
    }
  }

  return [...buckets.values()]
    .filter((candidate) => candidate.occurrences.length >= 2)
    .sort((a, b) => {
      const wordDiff = words(b.anchor).length - words(a.anchor).length;
      if (wordDiff) return wordDiff;
      return a.occurrences.length - b.occurrences.length;
    });
}

export async function generateItqanMutashabihatQuestion(input: {
  anchor: string;
  juz: number;
  occurrencesRequired?: number | "all";
  ayahsAfter?: number;
}) {
  const db = getSupabaseAdmin();
  const normalizedAnchor = normalizeArabic(input.anchor);
  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,text_ar,normalized_text")
    .eq("juz_number", input.juz)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Ayah[];
  const candidates = buildCandidates(rows);
  const target = candidates.find((candidate) => normalizeArabic(candidate.anchor) === normalizedAnchor);
  if (!target) throw new Error("No local mutashabihat family found for \"" + input.anchor + "\".");

  const required = input.occurrencesRequired ?? 2;
  const selected = required === "all" ? target.occurrences : target.occurrences.slice(0, Math.min(required, target.occurrences.length));
  const after = Math.max(0, Math.min(3, input.ayahsAfter ?? 1));

  const occurrenceRows = await Promise.all(selected.map(async (occurrence) => {
    const { data: following, error: followingError } = await db
      .from("ayahs")
      .select("ayah_number,text_ar")
      .eq("surah_id", occurrence.surah_id)
      .gte("ayah_number", occurrence.ayah_number)
      .lte("ayah_number", occurrence.ayah_number + after)
      .order("ayah_number", { ascending: true });
    if (followingError) throw new Error(followingError.message);
    return {
      surah_id: occurrence.surah_id,
      ayah_number: occurrence.ayah_number,
      ayahs: (following ?? []).map((ayah) => ({ ayah_number: Number(ayah.ayah_number), text_ar: String(ayah.text_ar) })),
    };
  }));

  const difficulty = scoreDifficulty({
    occurrenceCount: target.occurrences.length,
    anchorWordCount: anchorWordCount(normalizedAnchor),
    anchorCharCount: normalizedAnchor.length,
    requestedAyahs: after + 1,
    similarityGroupSize: target.occurrences.length,
  });

  const countLabel = required === "all" ? "جميع المواضع" : String(selected.length) + " مواضع";
  const afterLabel = after === 0 ? "الآية" : "الآية وما بعدها";

  return {
    question_type: "mutashabihat" as const,
    prompt: "اذكر " + countLabel + " التي ورد فيها: «" + target.anchor + "»، واذكر " + afterLabel,
    expected_answer: {
      anchor: target.anchor,
      occurrences_required: required,
      ayahs_after: after,
      include_surah: false,
      occurrences: occurrenceRows,
    },
    difficulty,
    metadata: {
      engine: "itqan-local",
      occurrences_found: target.occurrences.length,
      selected_occurrences: occurrenceRows.length,
      juz: input.juz,
    },
  };
}

export async function getItqanMutashabihatCandidates(juz: number, limit = 40) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,text_ar,normalized_text")
    .eq("juz_number", juz)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });
  if (error) throw new Error(error.message);
  return buildCandidates((data ?? []) as Ayah[]).slice(0, limit);
}
