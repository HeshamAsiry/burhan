# Burhan Test Generator v1

Burhan supports two generation modes:

1. **Default blueprint** — deterministic question generation from the Quran knowledge map with seven difficulty levels and cumulative/non-cumulative coverage.
2. **Burhan Al-Itqan style** — a dedicated graded exam mode inspired by the publicly described methodology of *Burhan Al-Itqan*: systematic Juz-based testing, increasing difficulty, and varied question forms such as recitation/sard, mutashabihat, word prompts, sentence prompts, and multiple-choice questions. This mode does not copy the external book's question bank or private selection algorithm.

## Burhan Al-Itqan style API

`POST /api/v1/tests/generate`

Example:

```json
{
  "juz": 30,
  "style": "burhan_itqan",
  "test_number": 1,
  "question_count": 10,
  "persist": false
}
```

`test_number` accepts `1` through `10`. It controls the progression of the model: later tests use longer recitation ranges, more demanding fragments, more mutashabihat pressure, and additional contextual requirements.

The generated question mix can include:

- `recite_range` — سرد/تسميع بين موضع بداية وموضع نهاية.
- `fragment_recall` with `mode: "word"` — سؤال يبدأ من كلمة مقتطفة من الآية.
- `fragment_recall` with `mode: "sentence"` — سؤال يبدأ من جملة قصيرة مقتطفة من الآية.
- `mutashabihat` — مواضع متشابهة تحتاج استدعاءً وتمييزًا.
- `anchor_recall` — استدعاء مواضع مرتبطة بلفظ قرآني.
- `mcq` — اختيار من متعدد.

The API keeps the complete expected answer internally for grading, while user-facing prompts expose only the selected fragment where appropriate.

## Current generation path

`POST /api/v1/tests/generate`

The endpoint accepts either:

1. explicit `questions` for controlled/custom generation, or
2. `question_count` without `questions` to let Burhan build a blueprint automatically.

For the dedicated style, add:

```json
{
  "style": "burhan_itqan",
  "test_number": 1
}
```

When persisted, the test stores the style and test number in its configuration and links the generated blueprint.

## Important scope

The public descriptions available for *Burhan Al-Itqan* describe graded Juz-based testing and diverse question forms, and some listings describe ten tests per Juz. Burhan uses those documented characteristics as design inspiration; it does not reproduce the external book's exact questions or unpublished selection methodology.
