import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";

export type McqQuestion = {
  question_type: "mcq";
  prompt: string;
  expected_answer: {
    option_id: string;
    surah_id: number;
    surah_name_ar: string;
    ayah_number: number;
    options: Array<{ id: string; surah_id: number; surah_name_ar: string }>;
  };
  difficulty: number;
};

function shuffle<T>(items: T[]) {
  return [...items].sort((a, b) => String(a).localeCompare(String(b)));
}

export async function generateSurahMcqQuestion(input: {
  surahId?: number;
  ayahNumber?: number;
  anchor?: string;
}): Promise<McqQuestion> {
  const db = getSupabaseAdmin();
  let target: { surah_id: number; ayah_number: number; text_ar: string; normalized_text: string } | null = null;

  if (input.surahId != null && input.ayahNumber != null) {
    const { data, error } = await db
      .from("ayahs")
      .select("surah_id,ayah_number,text_ar,normalized_text")
      .eq("surah_id", input.surahId)
      .eq("ayah_number", input.ayahNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    target = data;
  } else {
    const anchor = input.anchor?.trim();
    if (!anchor) throw new Error("Provide anchor or surah_id + ayah_number.");
    const normalized = normalizeArabic(anchor);
    const { data, error } = await db
      .from("ayahs")
      .select("surah_id,ayah_number,text_ar,normalized_text")
      .ilike("normalized_text", '%' + normalized + '%')
      .order("surah_id")
      .order("ayah_number")
      .limit(2);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("No ayah found for the supplied anchor.");
    if (data.length > 1) throw new Error("Anchor is ambiguous; provide surah_id + ayah_number.");
    target = data[0];
  }

  if (!target) throw new Error("Target ayah not found.");

  const { data: surahs, error: surahsError } = await db
    .from("surahs")
    .select("id,name_ar")
    .order("id");
  if (surahsError) throw new Error(surahsError.message);

  const available = (surahs ?? [])
    .filter((surah) => Number(surah.id) !== Number(target!.surah_id))
    .map((surah) => ({ surah_id: Number(surah.id), surah_name_ar: surah.name_ar as string }));

  const distractors = shuffle(available)
    .slice(0, 3);

  const options = shuffle([
    ...distractors.map((item, index) => ({ id: "d" + (index + 1), ...item })),
    { id: "correct", surah_id: Number(target.surah_id), surah_name_ar: "السورة" },
  ]);

  const { data: targetSurah, error: targetSurahError } = await db
    .from("surahs")
    .select("id,name_ar")
    .eq("id", target.surah_id)
    .maybeSingle();
  if (targetSurahError) throw new Error(targetSurahError.message);
  if (!targetSurah) throw new Error("Target surah not found.");

  const normalizedOptions = options.map((option) => ({
    ...option,
    surah_name_ar: option.surah_id === Number(targetSurah.id) ? targetSurah.name_ar : option.surah_name_ar,
  }));

  const correct = normalizedOptions.find((option) => option.surah_id === Number(targetSurah.id))!;
  return {
    question_type: "mcq",
    prompt: 'أي سورة وردت فيها الآية: «' + target.text_ar + '»؟',
    expected_answer: {
      option_id: correct.id,
      surah_id: Number(targetSurah.id),
      surah_name_ar: targetSurah.name_ar,
      ayah_number: Number(target.ayah_number),
      options: normalizedOptions,
    },
    difficulty: 3,
  };
}

