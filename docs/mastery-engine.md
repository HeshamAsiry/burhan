# Mastery Engine

Burhan stores learner-specific Quran mastery independently from tests and attempts.

## Why it exists

A test score answers "how did the learner perform on this test?"

Mastery answers "which Quranic ayahs still need review?"

Each mastery record is keyed by:

- \`external_user_id\`
- \`ayah_id\`

Riwaq or another client controls the external user identity. Burhan does not create teacher/student accounts.

## Stored signals

For each learner + ayah:

- total attempts
- correct / partial / incorrect counts
- latest score
- smoothed mastery score
- consecutive correct / incorrect results
- last attempt time
- next review time

## Mastery update

Burhan v1 uses a simple exponential update:

\`new mastery = old mastery × 0.70 + latest score × 0.30\`

This is intentionally transparent and can later be replaced by a stronger spaced-repetition model.

## Review scheduling

The initial review intervals are derived from mastery and consecutive failures:

- mastery < 50 or two consecutive failures: 24 hours
- mastery < 70: 72 hours
- mastery < 85: 7 days
- mastery < 95: 21 days
- otherwise: 45 days

These are Burhan v1 heuristics, not claims about the external methodology.

## Review API

\`GET /api/v1/mastery/review?external_user_id=...&limit=20\`

Items are ordered primarily by lower mastery, then by the earliest review time.

## Scope

The current engine updates mastery from:

- \`recite_range\`: every expected ayah receives the question score.
- \`anchor_recall\`: each expected occurrence receives its own occurrence score.
- \`mutashabihat\`: the existing occurrence structure is supported.

The range behavior is intentionally conservative for v1 because the current text evaluator scores the submitted passage as a whole. Later, Burhan can align the answer to individual ayahs and produce finer-grained per-ayah scores.

## Privacy / ownership

Mastery is associated only through \`external_user_id\`. The API does not infer or create a client application's student identity.
