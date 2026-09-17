# Test Blueprint Engine

Burhan can now generate a test without a hand-written question list.

## Automatic request

```json
{
  "juz": 30,
  "level": 4,
  "test_type": "non_cumulative",
  "question_count": 10
}
```

The blueprint engine derives a question mix from the Quran knowledge map:

- **Level 1:** mostly shorter recitation ranges, light repeated-anchor recall.
- **Level 2:** introduces more anchor recall.
- **Level 3:** balanced range and mutashabihat questions.
- **Level 4:** more mutashabihat and two-occurrence recall.
- **Level 5:** more similar-family pressure and longer recitation ranges.
- **Level 6:** higher ambiguity and three-occurrence recall.
- **Level 7:** strongest ambiguity/length mix available from the current knowledge map.

These are **Burhan's independent v1 heuristics**. They are inspired by the publicly documented methodology of graded Quran testing, but they do not reproduce an external question bank or claim to reproduce its private selection algorithm.

## Current generation path

`POST /api/v1/tests/generate`

The endpoint now accepts either:

1. explicit `questions` for controlled/custom generation, or
2. `question_count` without `questions` to let Burhan build the blueprint automatically.

When automatic generation is persisted, the blueprint is stored in `test_blueprints` and linked to the generated `tests` row.

## Current limitation

The blueprint engine currently uses deterministic Quran-text signals. It does not yet consider a student's previous exposure, mastery history, or adaptive review state. Those belong to the later evaluation/mastery layer.
