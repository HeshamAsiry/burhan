# Burhan Question Model

Burhan separates **where a phrase occurs** from **what the learner must recite**.

## Core concepts

- `anchor`: the Arabic word or phrase used to locate an occurrence.
- `occurrences_required`: how many matching occurrences the question asks the learner to recall. It may be a number or `all`.
- `task`: the action performed after locating the occurrence.
- `ayahs_after`: number of additional ayahs to recite after the anchor ayah.

A "position" (موضع) is an occurrence of an anchor. It is not a question type.

## Example

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

The Quran may contain more matching occurrences than the question requests. Selection of the requested occurrences is now deterministic and spread across the available matches; future versions can add learner history, exposure, similarity, and coverage signals.

## Current question types

- `recite_range`: recite from a start anchor/ayah through an end anchor/ayah.
- `recite_following`: recite the anchor ayah plus N following ayahs.\n- `anchor_recall`: locate one or more occurrences of an anchor and recite the requested following ayahs; it may also require the surah name.
- `mutashabihat`: distinguish and recall similar passages as a similarity-family task, separate from occurrence counting.
- `identify_surah`: identify the surah associated with the requested occurrence.
- `mcq`: multiple-choice recall/recognition.

## Difficulty signals

Difficulty can be calculated from measurable features rather than manually assigning every question:

1. number of candidate occurrences;
2. similarity among candidate occurrences;
3. anchor length and distinctiveness;
4. requested recitation length;
5. distance between candidate occurrences;
6. wording difference at the relevant transition;
7. location/context constraints such as juz or page.

The book *Burhan al-Itqan* is used only as a methodology reference. Burhan's question bank is generated independently from the Quran knowledge map and does not reproduce the book's exact questions.
