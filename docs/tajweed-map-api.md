# Tajweed Knowledge Map API

## Get the expected Tajweed map for one ayah

GET /api/v1/tajweed-map?surah_id=2&ayah_number=4

Or:

GET /api/v1/tajweed-map?ayah_id=<uuid>

Response contains:

- the canonical ayah reference and text
- deterministic Tajweed occurrences for that ayah
- rule metadata
- expected behavior metadata
- source/map version

Example shape:

```json
{
  "ayah": {
    "surah_id": 2,
    "ayah_number": 4,
    "text_ar": "…"
  },
  "count": 1,
  "occurrences": [
    {
      "word_index": 7,
      "trigger_text": "مِن",
      "context_text": "قَبْلِكَ",
      "rule": {
        "code": "noon_ikhfa",
        "name_ar": "إخفاء حقيقي"
      },
      "expected_behavior": {
        "source": "noon_sakinah",
        "following_letter": "ق"
      }
    }
  ]
}
```

The endpoint is server-authenticated like the rest of Burhan's protected API.

The map is an expected-side knowledge layer. It is not a pronunciation verdict. The future audio analyzer will compare recorded speech against this expected context and can route uncertain cases to teacher review.
