import { getSupabaseAdmin } from "../supabase-admin";
import type { QuestionEvaluation } from "./evaluator";

type Question = {
  id: string;
  question_type: string;
  expected_answer: any;
};

type AyahScore = {
  score: number;
  questionId: string;
  questionType: string;
};

function getExpectedAyahs(question: Question, evaluation: QuestionEvaluation): Array<{ surah_id: number; ayah_number: number; score: number }> {
  const expected = question.expected_answer ?? {};

  if (question.question_type === "recite_range") {
    return Array.isArray(expected.ayahs)
      ? expected.ayahs
          .filter((ayah: any) => ayah?.surah_id != null && ayah?.ayah_number != null)
          .map((ayah: any) => ({
            surah_id: Number(ayah.surah_id),
            ayah_number: Number(ayah.ayah_number),
            score: evaluation.score,
          }))
      : [];
  }

  if (question.question_type === "anchor_recall" || question.question_type === "mutashabihat") {
    const details = Array.isArray(evaluation.feedback.details) ? evaluation.feedback.details : [];
    const occurrences = Array.isArray(expected.occurrences) ? expected.occurrences : [];

    return occurrences
      .map((occurrence: any, index: number) => {
        const detail = details.find((item) => Number(item.expected_index ?? -1) === index);
        return {
          surah_id: Number(occurrence.surah_id),
          ayah_number: Number(occurrence.ayah_number),
          score: detail ? Number(detail.score ?? 0) : 0,
        };
      })
      .filter((item) => Number.isFinite(item.surah_id) && Number.isFinite(item.ayah_number));
  }

  return [];
}

function reviewDelayHours(mastery: number, consecutiveIncorrect: number) {
  if (consecutiveIncorrect >= 2 || mastery < 50) return 24;
  if (mastery < 70) return 72;
  if (mastery < 85) return 168;
  if (mastery < 95) return 504;
  return 1080;
}

export async function updateMasteryForAttempt(input: {
  externalUserId?: string | null;
  attemptId: string;
  evaluatedQuestions: Array<{ question: Question; evaluation: QuestionEvaluation }>;
  attemptedAt: string;
}) {
  if (!input.externalUserId) return { updated: 0, skipped: "external_user_id_required" };

  const db = getSupabaseAdmin();
  const byAyah = new Map<string, AyahScore[]>();

  for (const item of input.evaluatedQuestions) {
    for (const ayah of getExpectedAyahs(item.question, item.evaluation)) {
      const key = \`\${ayah.surah_id}:\${ayah.ayah_number}\`;
      const list = byAyah.get(key) ?? [];
      list.push({
        score: ayah.score,
        questionId: item.question.id,
        questionType: item.question.question_type,
      });
      byAyah.set(key, list);
    }
  }

  const keys = [...byAyah.keys()];
  if (!keys.length) return { updated: 0 };

  const refs = keys.map((key) => {
    const [surahId, ayahNumber] = key.split(":").map(Number);
    return { surah_id: surahId, ayah_number: ayahNumber };
  });

  const ayahIds = new Map<string, string>();
  for (const ref of refs) {
    const { data, error } = await db
      .from("ayahs")
      .select("id")
      .eq("surah_id", ref.surah_id)
      .eq("ayah_number", ref.ayah_number)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.id) ayahIds.set(\`\${ref.surah_id}:\${ref.ayah_number}\`, data.id);
  }

  const ids = [...ayahIds.values()];
  const existingByAyah = new Map<string, any>();
  if (ids.length) {
    const { data, error } = await db
      .from("burhan_mastery")
      .select("*")
      .eq("external_user_id", input.externalUserId)
      .in("ayah_id", ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) existingByAyah.set(row.ayah_id, row);
  }

  const now = new Date(input.attemptedAt);
  const rows = [];

  for (const [key, scores] of byAyah) {
    const ayahId = ayahIds.get(key);
    if (!ayahId) continue;

    const current = existingByAyah.get(ayahId);
    const score = Number((scores.reduce((sum, item) => sum + item.score, 0) / scores.length).toFixed(2));
    const status = score >= 95 ? "correct" : score >= 70 ? "partial" : "incorrect";

    const previousMastery = Number(current?.mastery ?? 0);
    const attemptCount = Number(current?.attempt_count ?? 0) + 1;
    const mastery = Number(((previousMastery * 0.7) + (score * 0.3)).toFixed(2));
    const consecutiveCorrect = status === "correct" ? Number(current?.consecutive_correct ?? 0) + 1 : 0;
    const consecutiveIncorrect = status === "incorrect" ? Number(current?.consecutive_incorrect ?? 0) + 1 : 0;
    const delay = reviewDelayHours(mastery, consecutiveIncorrect);
    const nextReview = new Date(now.getTime() + delay * 60 * 60 * 1000).toISOString();

    rows.push({
      external_user_id: input.externalUserId,
      ayah_id: ayahId,
      attempt_count: attemptCount,
      correct_count: Number(current?.correct_count ?? 0) + (status === "correct" ? 1 : 0),
      partial_count: Number(current?.partial_count ?? 0) + (status === "partial" ? 1 : 0),
      incorrect_count: Number(current?.incorrect_count ?? 0) + (status === "incorrect" ? 1 : 0),
      mastery,
      last_score: score,
      last_status: status,
      consecutive_correct: consecutiveCorrect,
      consecutive_incorrect: consecutiveIncorrect,
      last_attempt_at: input.attemptedAt,
      next_review_at: nextReview,
      updated_at: input.attemptedAt,
    });
  }

  if (!rows.length) return { updated: 0 };

  const { error } = await db
    .from("burhan_mastery")
    .upsert(rows, { onConflict: "external_user_id,ayah_id" });

  if (error) throw new Error(error.message);

  return { updated: rows.length, attempt_id: input.attemptId };
}

export async function getReviewQueue(input: {
  externalUserId: string;
  limit?: number;
}) {
  const db = getSupabaseAdmin();
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));

  const { data, error } = await db
    .from("burhan_mastery")
    .select("id,ayah_id,attempt_count,mastery,last_score,last_status,consecutive_correct,consecutive_incorrect,last_attempt_at,next_review_at,ayahs!inner(surah_id,ayah_number,text_ar,juz_number,page_number)")
    .eq("external_user_id", input.externalUserId)
    .lte("next_review_at", new Date().toISOString())
    .order("mastery", { ascending: true })
    .order("next_review_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  return data ?? [];
}
