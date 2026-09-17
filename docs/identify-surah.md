# Identify Surah

`identify_surah` is a focused recognition question that asks the learner to identify which surah contains a given ayah or anchor.

## Endpoint

`POST /api/v1/questions/identify-surah`

By exact ayah:

```json
{
  "surah_id": 20,
  "ayah_number": 117
}
```

By anchor:

```json
{
  "anchor": "فقلنا"
}
```

An anchor must resolve to one ayah for this question type. If it matches multiple ayahs, the API requires `surah_id + ayah_number` so the question does not become ambiguous.

The expected answer includes the surah ID, Arabic surah name, and target ayah number.

The evaluator accepts either the correct `surah_id` or the correct Arabic surah name.

This question type can also be included in a manually supplied test through `POST /api/v1/tests/generate`.
