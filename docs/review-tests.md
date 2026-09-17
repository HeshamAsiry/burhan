# Review Test Generation

Burhan can turn due mastery items into a new test.

## Endpoint

\`POST /api/v1/mastery/review-test\`

Example:

\`\`\`json
{
  "external_user_id": "riwaq-user-123",
  "level": 3,
  "question_count": 10,
  "persist": true
}
\`\`\`

The engine:

1. reads the learner's due mastery queue;
2. selects the weakest due items first;
3. converts each target ayah into a focused recitation question;
4. generates a normal Burhan test from those questions.

When no items are due, the API returns \`status: "empty"\`.

## Current v1 behavior

Review tests use a single-ayah \`recite_range\` for each mastery target. This makes the feedback deterministic and directly tied to the weak ayah.

A later version can expand a weak target into:

- surrounding ayahs;
- the related anchor/occurrence family;
- a similar ayah from the same family;
- cumulative review mixed with new material.

This endpoint is independent of Riwaq. The client supplies \`external_user_id\` and owns the mapping to its learner.
