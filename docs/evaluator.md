# Quran Answer Evaluator

Burhan now evaluates submitted text answers against the canonical Quran text stored in the knowledge base.

## Comparison model

Evaluation does not mutate or rewrite the stored Quran text.

For comparison, Burhan:

1. removes Quranic/Arabic diacritics and annotation marks;
2. normalizes common Arabic letter variants;
3. tokenizes the expected and submitted text;
4. uses longest-common-subsequence matching to preserve word order;
5. calculates an F1-style score from token recall and precision.

The score is then classified as:

- **correct**: 95–100
- **partial**: 70–94.99
- **incorrect**: below 70

These thresholds are Burhan v1 implementation choices and are configurable later.

## Recitation ranges

For \`recite_range\`, the expected ayahs are concatenated in Quran order and compared with the submitted text.

## Anchor recall / mutashabihat

For occurrence-based questions, the evaluator expects:

\`\`\`json
{
  "occurrences": [
    { "text": "..." },
    { "text": "..." }
  ]
}
\`\`\`

It matches supplied occurrences to expected occurrences one-to-one, choosing the best available match for each supplied response.

When the question requires the surah, a supplied \`surah_id\` is also checked.

## Identify surah

For `identify_surah`, Burhan accepts either the expected `surah_id` or the Arabic surah name. A correct identification scores 100; an incorrect identification scores 0.

## Submission

\`POST /api/v1/tests/:testId/submit\`

Example:

\`\`\`json
{
  "external_user_id": "riwaq-user-123",
  "answers": [
    {
      "question_id": "00000000-0000-0000-0000-000000000000",
      "answer": {
        "text": "..."
      }
    }
  ]
}
\`\`\`

The API evaluates every question in the test. Missing answers receive zero.

The submission creates a \`test_attempts\` row and one \`test_answers\` row per test question.

## Result retrieval

\`GET /api/v1/tests/:testId/result\`

Returns stored attempts, including the summary and question-level evaluation.

## Important limitation

This is a **text-answer evaluator**. It does not yet judge audio, tajwid, makharij, or recitation pronunciation. An audio/STT layer can later feed a transcript into the same evaluation engine.
