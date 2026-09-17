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
    missing_tokens?: number;\n    missing_occurrences?: number;
    extra_tokens?: number;
    surah_correct?: boolean;
    details?: Array<Record<string, unknown>>;
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
  if (answer && typeof answer === "object" && typeof (answer as any).text === "string") return (answer as any).text;
  return "";
}

function scoreOccurrence(expected: any, supplied: any) {
  const expectedText = expectedAyahText(expected);
  const answerText = normalizeAnswerText(supplied);
  const comparison = compareRecitation(expectedText, answerText);

  let surahCorrect = true;
  if (expected.surah_id != null && supplied?.surah_id != null) {
    surahCorrect = Number(supplied.surah_id) === Number(expected.surah_id);
  }

  const adjustedScore = expected.surah_id != null && supplied?.surah_id != null && !surahCorrect
    ? comparison.score * 0.85
    : comparison.score;

  return { ...comparison, score: Number(adjustedScore.toFixed(2)), surahCorrect };
}

function evaluateOccurrenceSet(expectedOccurrences: any[], suppliedOccurrences: any[]) {
  const used = new Set<number>();
  const details: Array<Record<string, unknown>> = [];

  for (const supplied of suppliedOccurrences) {
    let bestIndex = -1;
    let best = { score: 0, matchedTokens: 0, expectedTokens: 0, answerTokens: 0, missingTokens: 0, extraTokens: 0, surahCorrect: true };

    for (let i = 0; i < expectedOccurrences.length; i++) {
      if (used.has(i)) continue;
      const candidate = scoreOccurrence(expectedOccurrences[i], supplied);
      if (candidate.score > best.score) {
        best = candidate;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && best.score > 0) used.add(bestIndex);
    details.push({ expected_index: bestIndex, ...best });
  }

  const answeredScores = details.map((detail) => Number(detail.score ?? 0));
  const missing = Math.max(0, expectedOccurrences.length - used.size);
  const score = expectedOccurrences.length
    ? Number(((answeredScores.reduce((sum, value) => sum + value, 0) / expectedOccurrences.length) * 0.9).toFixed(2))
    : 0;

  return { score, answered: used.size, missing, details };
}

export function evaluateQuestion(question: {
  id: string;
  question_type: string;
  expected_answer: any;
}, answer: any): QuestionEvaluation {
  const expected = question.expected_answer ?? {};

  if (question.question_type === "recite_range") {
    const expectedText = Array.isArray(expected.ayahs)
      ? expected.ayahs.map((ayah: any) => ayah?.text_ar ?? "").join(" ")
      : "";
    const answerText = normalizeAnswerText(answer);
    const comparison = compareRecitation(expectedText, answerText);
    return {
      question_id: question.id,
      question_type: question.question_type,
      score: comparison.score,
      status: statusForScore(comparison.score),
      feedback: comparison,
    };
  }

  if (question.question_type === "anchor_recall" || question.question_type === "mutashabihat") {
    const expectedOccurrences = Array.isArray(expected.occurrences) ? expected.occurrences : [];
    const suppliedOccurrences = Array.isArray(answer?.occurrences)
      ? answer.occurrences
      : answer
        ? [{ text: normalizeAnswerText(answer), surah_id: answer?.surah_id }]
        : [];

    const result = evaluateOccurrenceSet(expectedOccurrences, suppliedOccurrences);

    const surahRequired = Boolean(expected.include_surah);
    const surahCorrect = !surahRequired || result.details.every((detail) => detail.surahCorrect !== false);
    const score = Number((result.score * (surahRequired && !surahCorrect ? 0.85 : 1)).toFixed(2));

    return {
      question_id: question.id,
      question_type: question.question_type,
      score,
      status: statusForScore(score),
      feedback: {
        expected_occurrences: expectedOccurrences.length,
        answered_occurrences: result.answered,
        missing_occurrences: result.missing,
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
