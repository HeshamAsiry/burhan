# Anchor Recall

`anchor_recall` is Burhan's occurrence-based recall question.

It models the question as:

- **anchor**: a word or phrase used to locate the Quranic occurrence.
- **occurrences_required**: how many occurrences the learner must recall, or `all`.
- **ayahs_after**: how many ayahs after the anchor ayah must be recited.
- **include_surah**: whether the learner must also identify the surah.

"موضع" is represented by an occurrence. It is not a separate question type.

## Examples

### Two occurrences

```json
{
  "anchor": "فقلنا",
  "occurrences_required": 2,
  "ayahs_after": 1
}
```

### All occurrences + surah name

```json
{
  "anchor": "يطاف",
  "occurrences_required": "all",
  "ayahs_after": 1,
  "include_surah": true
}
```

## Endpoint

`POST /api/v1/questions/anchor-recall`

Example body:

```json
{
  "anchor": "فقلنا",
  "occurrences_required": 2,
  "ayahs_after": 1,
  "include_surah": true,
  "juz_min": 1,
  "juz_max": 30
}
```

The generator selects requested occurrences deterministically across the available matches rather than always taking the first N matches.

For cumulative test blueprints, the Juz scope is passed explicitly so the question engine can draw from the current Juz and the covered cumulative range.

The question bank remains independently generated from the Quran knowledge map; external methodology is not reproduced as an exact question bank.
