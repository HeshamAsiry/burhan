import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";

export type FragmentRecallMode = "word" | "sentence";

export type FragmentRecallQuestion = {
  question_type: "fragment_recall";
  prompt: string;
  expected_answer: {
    mode: FragmentRecallMode;
    fragment: string;
    surah_id: number;
    ayah_number: number;
    answer_text: string;
    source_ayah: string;
  };
  difficulty: number;
  metadata: {
    fragment_word_count: number;
    juz_number: number | null;
  };
};

function words(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean);
}

function locateFragment(source: string, fragment: string) {
  const sourceWords = words(source);
  const fragmentWords = words(fragment);

  if (!fragmentWords.length) return -1;

  const normalizedSource = sourceWords.map((word) => normalizeArabic(word));
  const normalizedFragment = fragmentWords.map((word) => normalizeArabic(word));

  for (let index = 0; index <= normalizedSource.length - normalizedFragment.length; index++) {
    let matched = true;
    for (let offset = 0; offset < normalizedFragment.length; offset++) {
      if (normalizedSource[index + offset] !== normalizedFragment[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }

  return -1;
}

export async function generateFragmentRecallQuestion(input: {
  mode: FragmentRecallMode;
  surahId: number;
  ayahNumber: number;
  fragment?: string;
  ayahsAfter?: number;
}): Promise<FragmentRecallQuestion> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,text_ar,juz_number")
    .eq("surah_id", input.surahId)
    .eq("ayah_number", input.ayahNumber)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Ayah not found: ${input.surahId}:${input.ayahNumber}`);

  const source = String(data.text_ar);
  const sourceWords = words(source);
  if (!sourceWords.length) throw new Error("Target ayah has no text.");

  const requestedWords =
    input.fragment?.trim() ||
    (input.mode === "word"
      ? sourceWords[Math.min(1, sourceWords.length - 1)]
      : sourceWords.slice(1, Math.min(5, sourceWords.length)).join(" "));

  let startIndex = locateFragment(source, requestedWords);

  if (startIndex < 0) {
    throw new Error(`Fragment not found in target ayah: ${requestedWords}`);
  }

  const ayahsAfter = Math.max(0, Math.min(5, input.ayahsAfter ?? 0));
  let answerWords = sourceWords.slice(startIndex);

  if (ayahsAfter > 0) {
    const { data: following, error: followingError } = await db
      .from("ayahs")
      .select("ayah_number,text_ar")
      .eq("surah_id", input.surahId)
      .gte("ayah_number", input.ayahNumber + 1)
      .lte("ayah_number", input.ayahNumber + ayahsAfter)
      .order("ayah_number", { ascending: true });

    if (followingError) throw new Error(followingError.message);

    for (const ayah of following ?? []) {
      answerWords = [...answerWords, ...words(String(ayah.text_ar))];
    }
  }

  const fragment = sourceWords
    .slice(startIndex, startIndex + (input.mode === "word" ? 1 : Math.min(5, sourceWords.length - startIndex)))
    .join(" ");

  return {
    question_type: "fragment_recall",
    prompt:
      input.mode === "word"
        ? `أكمل ابتداءً من كلمة: «${fragment}»`
        : `أكمل ابتداءً من قوله تعالى: «${fragment}»`,
    expected_answer: {
      mode: input.mode,
      fragment,
      surah_id: Number(data.surah_id),
      ayah_number: Number(data.ayah_number),
      answer_text: answerWords.join(" "),
      source_ayah: source,
    },
    difficulty: input.mode === "word" ? 2 : 4,
    metadata: {
      fragment_word_count: words(fragment).length,
      juz_number: data.juz_number == null ? null : Number(data.juz_number),
    },
  };
}

export async function generateAutoFragmentRecallCandidates(input: {
  juz: number;
  mode: FragmentRecallMode;
  limit?: number;
}) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,text_ar,juz_number")
    .eq("juz_number", input.juz)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true })
    .limit(250);

  if (error) throw new Error(error.message);

  const candidates = (data ?? []).flatMap((ayah) => {
    const text = String(ayah.text_ar);
    const sourceWords = words(text);
    if (sourceWords.length < 2) return [];

    if (input.mode === "word") {
      const indices = [1, 2].filter(
        (index) => index < sourceWords.length && sourceWords.length - index >= 3,
      );
      return indices.slice(0, 2).map((index) => ({
        surah_id: Number(ayah.surah_id),
        ayah_number: Number(ayah.ayah_number),
        fragment: sourceWords[index],
      }));
    }

    return [1, 2]
      .filter((index) => sourceWords.length - index >= 6)
      .map((index) => ({
        surah_id: Number(ayah.surah_id),
        ayah_number: Number(ayah.ayah_number),
        fragment: sourceWords.slice(index, index + 4).join(" "),
      }));
  });

  return candidates.slice(0, input.limit ?? 40);
}
