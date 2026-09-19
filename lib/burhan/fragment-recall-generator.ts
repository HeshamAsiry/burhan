import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";

export type FragmentRecallMode = "word" | "sentence" | "ayah_and_next";

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
    next_ayah?: string;
    next_ayah_number?: number;
    surah_name_ar?: string;
  };
  difficulty: number;
  metadata: {
    fragment_word_count: number;
    juz_number: number | null;
  };
};

const WEAK_ANCHOR_WORDS = new Set([
  "و", "ف", "ب", "ك", "ل", "ال", "من", "إلى", "عن", "على", "في", "ما", "مِن", "إِن",
  "إن", "أن", "أو", "لا", "لم", "لن", "قد", "ثم", "هو", "هي", "هم", "هن", "هذا", "هذه",
  "ذلك", "تلك", "الذي", "التي", "قال", "قالوا", "كان", "كانت", "يكون", "يوم", "كل",
]);

function words(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean);
}

function normalizedWords(text: string) {
  return words(text).map((word) => normalizeArabic(word));
}

function locateFragment(source: string, fragment: string) {
  const sourceWords = normalizedWords(source);
  const fragmentWords = normalizedWords(fragment);
  if (!fragmentWords.length) return -1;

  for (let index = 0; index <= sourceWords.length - fragmentWords.length; index++) {
    let matched = true;
    for (let offset = 0; offset < fragmentWords.length; offset++) {
      if (sourceWords[index + offset] !== fragmentWords[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function buildContextFragment(sourceWords: string[], startIndex: number, length = 4) {
  const end = Math.min(sourceWords.length, startIndex + length);
  return sourceWords.slice(startIndex, end).join(" ");
}

function isWeakSingleWord(word: string) {
  return WEAK_ANCHOR_WORDS.has(normalizeArabic(word));
}

function fragmentPrompt(mode: FragmentRecallMode, fragment: string) {
  if (mode === "word") {
    return `أكمل ابتداءً من قوله تعالى: «${fragment}»`;
  }
  return `أكمل ابتداءً من قوله تعالى: «${fragment}»`;
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

  if (input.mode === "ayah_and_next") {
    const { data: nextAyah, error: nextError } = await db
      .from("ayahs")
      .select("ayah_number,text_ar")
      .eq("surah_id", input.surahId)
      .eq("ayah_number", input.ayahNumber + 1)
      .maybeSingle();

    if (nextError) throw new Error(nextError.message);
    if (!nextAyah) throw new Error(`No following ayah found: ${input.surahId}:${input.ayahNumber + 1}`);

    const { data: surah, error: surahError } = await db
      .from("surahs")
      .select("id,name_ar")
      .eq("id", input.surahId)
      .maybeSingle();

    if (surahError) throw new Error(surahError.message);
    if (!surah) throw new Error(`Surah not found: ${input.surahId}`);

    const fragment = buildContextFragment(sourceWords, 0, Math.min(4, sourceWords.length));
    const answerText = `${source} ${String(nextAyah.text_ar)}`;
    return {
      question_type: "fragment_recall",
      prompt: `أكمل الآية، ثم اذكر الآية التالية، واذكر اسم السورة، ابتداءً من: «${fragment}…»`,
      expected_answer: {
        mode: "ayah_and_next",
        fragment,
        surah_id: Number(data.surah_id),
        ayah_number: Number(data.ayah_number),
        answer_text: answerText,
        source_ayah: source,
        next_ayah: String(nextAyah.text_ar),
        next_ayah_number: Number(nextAyah.ayah_number),
        surah_name_ar: surah.name_ar,
      },
      difficulty: 4,
      metadata: {
        fragment_word_count: words(fragment).length,
        juz_number: data.juz_number == null ? null : Number(data.juz_number),
      },
    };
  }

  let requestedFragment = input.fragment?.trim();

  if (!requestedFragment) {
    const defaultStart = Math.min(1, Math.max(0, sourceWords.length - 1));
    requestedFragment = buildContextFragment(
      sourceWords,
      defaultStart,
      input.mode === "word" ? 4 : 4,
    );
  }

  const requestedWords = words(requestedFragment);
  const startIndex = locateFragment(source, requestedFragment);
  if (startIndex < 0) throw new Error(`Fragment not found in target ayah: ${requestedFragment}`);

  // A single generic word is too weak for a memorization test. Expand it to a
  // distinctive 3–5 word Quranic anchor even when a caller supplied one word.
  if (input.mode === "word" && requestedWords.length === 1) {
    if (isWeakSingleWord(requestedWords[0]) || sourceWords.length - startIndex < 3) {
      requestedFragment = buildContextFragment(sourceWords, Math.max(0, startIndex - 1), 4);
    } else {
      requestedFragment = buildContextFragment(sourceWords, startIndex, 4);
    }
  }

  const effectiveStartIndex = locateFragment(source, requestedFragment);
  if (effectiveStartIndex < 0) throw new Error(`Unable to resolve recall anchor: ${requestedFragment}`);

  const ayahsAfter = Math.max(0, Math.min(5, input.ayahsAfter ?? 0));
  let answerWords = sourceWords.slice(effectiveStartIndex);

  if (ayahsAfter > 0) {
    const { data: following, error: followingError } = await db
      .from("ayahs")
      .select("ayah_number,text_ar")
      .eq("surah_id", input.surahId)
      .gte("ayah_number", input.ayahNumber + 1)
      .lte("ayah_number", input.ayahNumber + ayahsAfter)
      .order("ayah_number", { ascending: true });

    if (followingError) throw new Error(followingError.message);
    for (const ayah of following ?? []) answerWords = [...answerWords, ...words(String(ayah.text_ar))];
  }

  const fragment = words(requestedFragment).slice(0, 5).join(" ");

  return {
    question_type: "fragment_recall",
    prompt: fragmentPrompt(input.mode, fragment),
    expected_answer: {
      mode: input.mode,
      fragment,
      surah_id: Number(data.surah_id),
      ayah_number: Number(data.ayah_number),
      answer_text: answerWords.join(" "),
      source_ayah: source,
    },
    difficulty: input.mode === "word" ? 3 : 4,
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
    .order("ayah_number", { ascending: true });

  if (error) throw new Error(error.message);

  const ayahs = data ?? [];
  const phraseCounts = new Map<string, number>();

  // Count short Quranic phrases inside the selected Juz. We only keep anchors
  // that occur once, which makes the prompt much more discriminative than a
  // generic word such as "إلى" or "نَجْعَلِ".
  for (const ayah of ayahs) {
    const sourceWords = words(String(ayah.text_ar));
    const normalized = sourceWords.map((word) => normalizeArabic(word));
    for (let size = 3; size <= 5; size++) {
      for (let index = 0; index + size <= normalized.length; index++) {
        const phrase = normalized.slice(index, index + size).join(" ");
        phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
      }
    }
  }

  const candidates = ayahs.flatMap((ayah) => {
    const sourceWords = words(String(ayah.text_ar));
    if (sourceWords.length < 3) return [];

    if (input.mode === "ayah_and_next") {
      return [{
        surah_id: Number(ayah.surah_id),
        ayah_number: Number(ayah.ayah_number),
        fragment: buildContextFragment(sourceWords, 0, Math.min(4, sourceWords.length)),
      }];
    }

    const minSize = input.mode === "word" ? 3 : 4;
    const maxSize = input.mode === "word" ? 4 : 5;
    const result: Array<{ surah_id: number; ayah_number: number; fragment: string }> = [];

    for (let size = minSize; size <= maxSize; size++) {
      for (let index = 0; index + size <= sourceWords.length; index++) {
        const normalizedFirst = normalizeArabic(sourceWords[index]);
        const normalizedPhrase = sourceWords
          .slice(index, index + size)
          .map((word) => normalizeArabic(word))
          .join(" ");

        if (isWeakSingleWord(sourceWords[index])) continue;
        if ((phraseCounts.get(normalizedPhrase) ?? 0) !== 1) continue;

        result.push({
          surah_id: Number(ayah.surah_id),
          ayah_number: Number(ayah.ayah_number),
          fragment: sourceWords.slice(index, index + size).join(" "),
        });
      }
    }

    return result;
  });

  // Prefer compact, distinctive anchors; longer phrases are slightly stronger,
  // while keeping the generated prompts natural for students.
  const unique = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key = `${candidate.surah_id}:${candidate.ayah_number}:${normalizeArabic(candidate.fragment)}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }

  const sorted = [...unique.values()].sort((a, b) => {
    const aLength = words(a.fragment).length;
    const bLength = words(b.fragment).length;
    if (aLength !== bLength) return bLength - aLength;
    return a.ayah_number - b.ayah_number;
  });

  return sorted.slice(0, input.limit ?? 40);
}
