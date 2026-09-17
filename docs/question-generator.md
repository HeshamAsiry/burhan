# Burhan Question Generator

The question generator converts Quran-derived similarity families into independent `mutashabihat` questions.

## Pipeline

`anchor -> occurrences -> similarity families -> selected occurrences -> question`

`موضع` means an occurrence of an anchor in the Quran. It is not a question type.

## Current output

Each generated question contains:

- `question_type`: `mutashabihat`
- `prompt`
- `expected_answer.anchor`
- `expected_answer.occurrences_required`
- `expected_answer.ayahs_after`
- selected Quran occurrences
- deterministic difficulty
- family metadata

The generator does not copy an external question bank. It derives the question from the Quran knowledge map stored by Burhan.

## Current heuristic

Selection is deterministic and currently prioritizes members with higher pairwise similarity, then Quran order as a tie-breaker. This is a v1 heuristic and is not claimed to reproduce the methodology or selection of any external book.

Future versions should select questions using the test blueprint, previous exposure, difficulty targets, similarity families, and coverage constraints.
