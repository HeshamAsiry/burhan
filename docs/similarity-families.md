# Similarity Families

Similarity families are Burhan's deterministic grouping layer for repeated or closely related Quranic passages.

## Model

A family is derived from Quran text, not copied from an external question bank. The engine:

1. receives an anchor;
2. retrieves ayahs containing that anchor;
3. compares normalized word sequences using common prefix/suffix coverage;
4. connects occurrences when similarity crosses the configured threshold or they share at least two boundary words;
5. extracts connected components of two or more occurrences;
6. records the strongest difference point for each occurrence;
7. assigns a heuristic difficulty from family size and similarity.

`normalized_text` is used only for search/comparison. Canonical `text_ar` is never modified.

## Occurrence terminology

`موضع` means an occurrence/ayah. `موضعان` means two occurrences. They are not question types.

A later question generator can therefore express a request such as:

- anchor: `فقلنا`
- occurrences_required: `2`
- task: `recite_following`
- ayahs_after: `1`

The family layer only supplies the knowledge needed to choose meaningful occurrences.

## API

`POST /api/v1/similarity/families`

```json
{
  "anchor": "فقلنا",
  "threshold": 0.45,
  "limit": 30,
  "persist": true
}
```

The threshold is a heuristic and is not claimed to reproduce the methodology of any published book. It will be tuned using reviewed Quran examples.

## Next layer

The next step is the independent question generator: select a family, choose the required occurrence count, choose the requested number of following ayahs, and produce a `mutashabihat` question without storing or reproducing an external book's question wording.
