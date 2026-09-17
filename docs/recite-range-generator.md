# RECITE_RANGE question generator

```json
{
  "start": { "surah_id": 5, "ayah_number": 21, "anchor": "يا قوم ادخلوا الأرض المقدسة" },
  "end": { "surah_id": 5, "ayah_number": 24, "anchor": "إنا هاهنا قاعدون" }
}
```

The generator resolves both endpoints, validates Quran order, retrieves the complete ordered range, and returns the canonical ayah text as the expected answer.

Anchors are only locators. If an anchor matches more than one ayah, the caller must provide the exact `surah_id` and `ayah_number` to remove ambiguity.

The generator is independent of any external question bank. It derives the range from the canonical Quran dataset stored by Burhan.
