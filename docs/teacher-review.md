# Teacher review / Needs teacher review

Burhan keeps automated Tajweed analysis separate from the teacher's final judgment.

## Automated verdicts

- verified: the analysis is sufficiently confident and no issue was detected.
- detected_issue: an issue was detected with strong enough evidence.
- needs_teacher_review: the system is not confident enough to make a final judgment.
- not_assessed: reserved for future analyses that could not be performed.

The v1 review policy sends an analysis to teacher review when the audio is not clearly usable, confidence is below 0.75, there are unresolved signals, or conflicting signals. A no-issue result can be auto-verified at confidence >= 0.85; a detected issue can be auto-marked at confidence >= 0.90.

These thresholds are Burhan policy defaults, not claims about a specific external methodology.

## API

### Create or update a Tajweed analysis

POST /api/v1/tajweed-analysis

The endpoint is intended for the Tajweed analysis layer. It stores the model result and automatically decides whether teacher review is required.

Minimum body:

```json
{
  "attempt_id": "…",
  "question_id": "…",
  "tajweed_score": 84,
  "confidence": 0.71,
  "issue_detected": true,
  "audio_quality": "good",
  "evidence": [
    {
      "ayah_number": 12,
      "rule": "example-rule",
      "confidence": 0.62
    }
  ]
}
```

A confidence of 0.71 produces a needs_teacher_review result with reason low_confidence.

### Submit a teacher decision

POST /api/v1/tajweed-analysis/:analysisId/review

Statuses:

- confirmed: the teacher confirms the detected issue.
- rejected: the teacher does not confirm the issue.
- unclear: more human review is needed.

A confirmed review moves the automated verdict to detected_issue; a rejected review moves it to verified; an unclear review keeps it at needs_teacher_review.

The teacher can also provide final_score without overwriting the original AI score.

### Review queue

GET /api/v1/teacher-reviews?status=needs_teacher_review&limit=50

This returns analyses currently requiring human review, including the associated audio answer, evidence, model confidence, and question metadata.

## Design principle

The AI verdict and teacher verdict are kept distinct. This allows Burhan to improve the automated analyzer later without losing the teacher's final judgment.
