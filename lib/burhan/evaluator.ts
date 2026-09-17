function normalizeForEvaluation(input: string) {
  return input
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[إأٱآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}



export type EvaluationStatus = "correct" | "partial" | "incorrect";

export type QuestionEvaluation = {
  question_id: string;
  question_type: string;
  score: number;
  status: EvaluationStatus;
  feedback: {
    expected_occurrences?: number;
    answered_occurrences?: number;
    matched_tokens?: number;
    expected_tokens?: number;
    answer_tokens?: number;
    missing_tokens?: number;
    missing_occurrences?: number;
    extra_occurrences?: number;
    extra_tokens?: number;
    surah_correct?: boolean;
    ayah_scores?: Array<{ surah_id: number; ayah_number: number; score: number; status: EvaluationStatus; expected_tokens: number; matched_tokens: number }>;
    details?: Array<Record<string, unknown>>;
    ayah_scores?: Array<{ surah_id: number; ayah_number: number; score: number; status: EvaluationStatus; expected_tokens: number; matched_tokens: number }>;
  };
};

const CORRECT_THRESHOLD = 0.95;
const PARTIAL_THRESHOLD = 0.70;

function tokens(text: string) {
  return normalizeForEvaluation(text).split(/\s+/).filter(Boolean);
}

function lcsLength(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  let prev = new Uint16Array(shorter.length + 1);
  let curr = new Uint16Array(shorter.length + 1);

  for (const value of longer) {
    curr[0] = 0;
    for (let j = 1; j <= shorter.length; j++) {
      curr[j] = value === shorter[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  return prev[shorter.length];
}

function lcsMatchedExpectedIndices(a: string[], b: string[]) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint16Array(cols));

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const matched = new Set<number>();
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      matched.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matched;
}

export function compareRecitationByAyah(
  expectedAyahs: Array<{ surah_id: number; ayah_number: number; text_ar: string }>,
  answerText: string,
) {
  const answer = tokens(answerText);
  const expectedWithTokens = expectedAyahs.map((ayah) => ({
    ...ayah,
    tokens: tokens(ayah.text_ar),
  }));
  const expected = expectedWithTokens.flatMap((ayah) => ayah.tokens);

  if (!expected.length) return [];

  const matchedIndices = lcsMatchedExpectedIndices(expected, answer);
  const extraPenalty = answer.length ? Math.min(1, expected.length / answer.length) : 0;

  let offset = 0;
  return expectedWithTokens.map((ayah: { surah_id: number; ayah_number: number; text_ar: string; tokens: string[] }) => {
    const start = offset;
    const end = offset + ayah.tokens.length;
    offset = end;

    let matched = 0;
    for (let i = start; i < end; i++) {
      if (matchedIndices.has(i)) matched++;
    }

    const score = Number((matched / Math.max(1, ayah.tokens.length) * extraPenalty * 100).toFixed(2));
    return {
      surah_id: ayah.surah_id,
      ayah_number: ayah.ayah_number,
      score,
      status: statusForScore(score),
      expected_tokens: ayah.tokens.length,
      matched_tokens: matched,
    };
  });
}

export function compareRecitation(expectedText: string, answerText: string) {
  const expected = tokens(expectedText);
  const answer = tokens(answerText);

  if (!expected.length) return { score: 0, matchedTokens: 0, expectedTokens: 0, answerTokens: answer.length, missingTokens: 0, extraTokens: answer.length };

  const matched = expected.join(" ") === answer.join(" ")
    ? expected.length
    : lcsLength(expected, answer);

  const recall = matched / expected.length;
  const precision = answer.length ? matched / answer.length : 0;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
  const score = Number((f1 * 100).toFixed(2));

  return {
    score,
    matchedTokens: matched,
    expectedTokens: expected.length,
    answerTokens: answer.length,
    missingTokens: Math.max(0, expected.length - matched),
    extraTokens: Math.max(0, answer.length - matched),
  };
}

function statusForScore(score: number): EvaluationStatus {
  if (score >= CORRECT_THRESHOLD * 100) return "correct";
  if (score >= PARTIAL_THRESHOLD * 100) return "partial";
  return "incorrect";
}

function expectedAyahText(answer: any) {
  return Array.isArray(answer?.ayahs)
    ? answer.ayahs.map((ayah: any) => ayah?.text_ar ?? "").join(" ")
    : "";
}

function normalizeAnswerText(answer: unknown) {
  if (typeof answer === "string") return answer;
  if (answer && typeof answer === "object") {
    const value = answer as any;
    if (typeof value.text === "string") return value.text;
    if (typeof value.transcript === "string") return value.transcript;
  }
  return "";
}

function scoreOccurrence(expected: any, supplied: any, requireSurah: boolean) {
  const expectedText = expectedAyahText(expected);
  const answerText = normalizeAnswerText(supplied);
  const comparison = compareRecitation(expectedText, answerText);
  const ayahScores = Array.isArray(expected?.ayahs)
    ? compareRecitationByAyah(
        expected.ayahs
          .filter((ayah: any) => ayah?.surah_id != null && ayah?.ayah_number != null && ayah?.text_ar)
          .map((ayah: any) => ({
            surah_id: Number(ayah.surah_id),
            ayah_number: Number(ayah.ayah_number),
            text_ar: ayah.text_ar,
          })),
        answerText,
      )
    : [];

  let surahCorrect = true;
  if (requireSurah) {
    if (expected.surah_id != null && supplied?.surah_id != null) {
      surahCorrect = Number(supplied.surah_id) === Number(expected.surah_id);
    } else if (expected.surah_name && typeof supplied?.surah_name === "string") {
      surahCorrect = normalizeForEvaluation(supplied.surah_name) === normalizeForEvaluation(expected.surah_name);
    } else {
      surahCorrect = false;
    }
  }

  const adjustedScore = requireSurah && !surahCorrect
    ? comparison.score * 0.85
    : comparison.score;

  return { ...comparison, score: Number(adjustedScore.toFixed(2)), surahCorrect, ayahScores };
}

function evaluateOccurrenceSet(expectedOccurrences: any[], suppliedOccurrences: any[], requireSurah: boolean) {
  const used = new Set<number>();
  const details: Array<Record<string, unknown>> = [];

  for (const supplied of suppliedOccurrences) {
    let bestIndex = -1;
    let best = { score: 0, matchedTokens: 0, expectedTokens: 0, answerTokens: 0, missingTokens: 0, extraTokens: 0, surahCorrect: true, ayahScores: [] as Array<{ surah_id: number; ayah_number: number; score: number; status: EvaluationStatus; expected_tokens: number; matched_tokens: number }> };

    for (let i = 0; i < expectedOccurrences.length; i++) {
      if (used.has(i)) continue;
      const candidate = scoreOccurrence(expectedOccurrences[i], supplied, requireSurah);
      if (candidate.score > best.score) {
        best = candidate;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && best.score > 0) used.add(bestIndex);
    details.push({ expected_index: bestIndex, ...best });
  }

  const answeredScores = details
    .filter((detail) => Number(detail.expected_index ?? -1) >= 0)
    .map((detail) => Number(detail.score ?? 0));
  const missing = Math.max(0, expectedOccurrences.length - used.size);
  const extra = Math.max(0, suppliedOccurrences.length - used.size);
  const baseScore = expectedOccurrences.length
    ? answeredScores.reduce((sum, value) => sum + value, 0) / expectedOccurrences.length
    : 0;
  const score = Number(Math.max(0, baseScore - Math.min(20, extra * 5)).toFixed(2));

  return { score, answered: used.size, missing, extra, details };
}

export function evaluateQuestion(question: {
  id: string;
  question_type: string;
  expected_answer: any;
}, answer: any): QuestionEvaluation {
  const expected = question.expected_answer ?? {};

  if (question.question_type === "recite_range") {
    const expectedAyahs = Array.isArray(expected.ayahs)
      ? expected.ayahs.filter((ayah: any) => ayah?.text_ar).map((ayah: any) => ({
          surah_id: Number(ayah.surah_id),
          ayah_number: Number(ayah.ayah_number),
          text_ar: ayah.text_ar,
        }))
      : [];
    const expectedText = expectedAyahs.map((ayah) => ayah.text_ar).join(" ");
    const answerText = normalizeAnswerText(answer);
    const comparison = compareRecitation(expectedText, answerText);
    const ayahScores = compareRecitationByAyah(expectedAyahs, answerText);
    return {
      question_id: question.id,
      question_type: question.question_type,
      score: comparison.score,
      status: statusForScore(comparison.score),
      feedback: { ...comparison, ayah_scores: ayahScores },
    };
  }

  if (question.question_type === "mcq") {
    const suppliedOption = typeof answer === "string"
      ? answer
      : typeof answer?.option_id === "string"
        ? answer.option_id
        : null;
    const correctOption = typeof expected.option_id === "string" ? expected.option_id : null;
    const correct = Boolean(suppliedOption && correctOption && suppliedOption === correctOption);

    return {
      question_id: question.id,
      question_type: question.question_type,
      score: correct ? 100 : 0,
      status: correct ? "correct" : "incorrect",
      feedback: {
        details: [{
          correct_option_id: correctOption,
          supplied_option_id: suppliedOption,
        }],
      },
    };
  }

  if (question.question_type === "identify_surah") {
    const suppliedId = answer?.surah_id != null ? Number(answer.surah_id) : null;
    const suppliedName = typeof answer?.surah_name_ar === "string"
      ? normalizeForEvaluation(answer.surah_name_ar)
      : typeof answer?.surah_name === "string"
        ? normalizeForEvaluation(answer.surah_name)
        : null;
    const expectedId = expected.surah_id != null ? Number(expected.surah_id) : null;
    const expectedName = typeof expected.surah_name_ar === "string"
      ? normalizeForEvaluation(expected.surah_name_ar)
      : null;

    const idCorrect = expectedId != null && suppliedId != null && expectedId === suppliedId;
    const nameCorrect = expectedName != null && suppliedName != null && expectedName === suppliedName;
    const correct = idCorrect || nameCorrect;

    return {
      question_id: question.id,
      question_type: question.question_type,
      score: correct ? 100 : 0,
      status: correct ? "correct" : "incorrect",
      feedback: {
        surah_correct: correct,
        details: [{
          expected_surah_id: expectedId,
          supplied_surah_id: suppliedId,
          expected_surah_name: expected.surah_name_ar ?? null,
          supplied_surah_name: answer?.surah_name_ar ?? answer?.surah_name ?? null,
        }],
      },
    };
  }

  if (question.question_type === "anchor_recall" || question.question_type === "mutashabihat") {
    const expectedOccurrences = Array.isArray(expected.occurrences) ? expected.occurrences : [];
    const suppliedOccurrences = Array.isArray(answer?.occurrences)
      ? answer.occurrences
      : answer
        ? [{ text: normalizeAnswerText(answer), surah_id: answer?.surah_id }]
        : [];

    const surahRequired = Boolean(expected.include_surah);
    const result = evaluateOccurrenceSet(expectedOccurrences, suppliedOccurrences, surahRequired);
    const surahCorrect = !surahRequired || result.details
      .filter((detail) => Number(detail.expected_index ?? -1) >= 0)
      .every((detail) => detail.surahCorrect !== false);
    const score = result.score;

    return {
      question_id: question.id,
      question_type: question.question_type,
      score,
      status: statusForScore(score),
      feedback: {
        expected_occurrences: expectedOccurrences.length,
        answered_occurrences: result.answered,
        missing_occurrences: result.missing,
        extra_occurrences: result.extra,
        surah_correct: surahCorrect,
        details: result.details,
      },
    };
  }

  return {
    question_id: question.id,
    question_type: question.question_type,
    score: 0,
    status: "incorrect",
    feedback: { details: [{ reason: "QUESTION_TYPE_NOT_SUPPORTED_YET" }] },
  };
}

export function summarizeEvaluations(evaluations: QuestionEvaluation[]) {
  const total = evaluations.length;
  const score = total
    ? Number((evaluations.reduce((sum, item) => sum + item.score, 0) / total).toFixed(2))
    : 0;

  const correct = evaluations.filter((item) => item.status === "correct").length;
  const partial = evaluations.filter((item) => item.status === "partial").length;
  const incorrect = evaluations.filter((item) => item.status === "incorrect").length;

  return {
    score,
    mastery: score,
    total_questions: total,
    correct,
    partial,
    incorrect,
    passed: score >= 80,
  };
}
