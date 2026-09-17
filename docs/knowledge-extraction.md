# Burhan Knowledge Extraction

Burhan builds its question engine from an independent Quran knowledge map. It does not copy a question bank from any book.

## Current extraction layer

The first deterministic layer extracts repeated anchors from the pinned Quran text:

- single-word anchors: repeated words with at least 4 normalized characters and 2–20 distinct ayah occurrences;
- phrase anchors: contiguous 2–6 word n-grams occurring in 2–20 distinct ayahs;
- `anchors.anchor_type` is `word` or `phrase`;
- `normalized_text` is used only for discovery/search;
- canonical `ayahs.text_ar` is never rewritten.

This gives the engine a searchable candidate set for examples such as `فقلنا`, `اقترب`, `يطاف`, and `لقد كفر` without hard-coding the examples.

## Important distinction

An anchor is the locator. An occurrence is a matching Quran location. The requested number of occurrences is a test constraint, not a question type.

For example:

```json
{
  "anchor": "فقلنا",
  "occurrences_required": 2,
  "task": {
    "type": "recite_following",
    "ayahs_after": 1
  }
}
```

## Next extraction layers

1. Populate durable `anchor_occurrences` for the extracted candidates.
2. Build similarity families from shared anchors and token-level differences.
3. Add transition and passage-length features.
4. Score candidate difficulty from 1–7.
5. Use those features when selecting questions for a blueprint.

The 1–7 score is Burhan's own deterministic scoring layer. It is not presented as a reconstruction of the book's private algorithm.
