export type PhonemeOperation = {
  type: "match" | "substitution" | "deletion" | "insertion";
  expected?: string;
  predicted?: string;
  expected_index?: number;
  predicted_index?: number;
};

export type PhonemeEvaluation = {
  score: number;
  distance: number;
  expected_count: number;
  predicted_count: number;
  matched_count: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  has_errors: boolean;
  operations: PhonemeOperation[];
};

function cleanPhonemes(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

export function comparePhonemes(
  expectedInput: string[],
  predictedInput: string[],
): PhonemeEvaluation {
  const expected = cleanPhonemes(expectedInput);
  const predicted = cleanPhonemes(predictedInput);

  const rows = expected.length + 1;
  const cols = predicted.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint16Array(cols));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const substitutionCost = expected[i - 1] === predicted[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + substitutionCost,
      );
    }
  }

  const operations: PhonemeOperation[] = [];
  let i = expected.length;
  let j = predicted.length;

  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      expected[i - 1] === predicted[j - 1] &&
      dp[i][j] === dp[i - 1][j - 1]
    ) {
      operations.push({
        type: "match",
        expected: expected[i - 1],
        predicted: predicted[j - 1],
        expected_index: i - 1,
        predicted_index: j - 1,
      });
      i--;
      j--;
      continue;
    }

    if (
      i > 0 &&
      j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + 1
    ) {
      operations.push({
        type: "substitution",
        expected: expected[i - 1],
        predicted: predicted[j - 1],
        expected_index: i - 1,
        predicted_index: j - 1,
      });
      i--;
      j--;
      continue;
    }

    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      operations.push({
        type: "deletion",
        expected: expected[i - 1],
        expected_index: i - 1,
      });
      i--;
      continue;
    }

    operations.push({
      type: "insertion",
      predicted: predicted[j - 1],
      predicted_index: j - 1,
    });
    j--;
  }

  operations.reverse();

  const matchedCount = operations.filter((item) => item.type === "match").length;
  const substitutions = operations.filter((item) => item.type === "substitution").length;
  const deletions = operations.filter((item) => item.type === "deletion").length;
  const insertions = operations.filter((item) => item.type === "insertion").length;
  const distance = dp[expected.length][predicted.length];
  const denominator = Math.max(expected.length, predicted.length, 1);
  const score = Number(Math.max(0, (1 - distance / denominator) * 100).toFixed(2));

  return {
    score,
    distance,
    expected_count: expected.length,
    predicted_count: predicted.length,
    matched_count: matchedCount,
    substitutions,
    deletions,
    insertions,
    has_errors: distance > 0,
    operations,
  };
}
