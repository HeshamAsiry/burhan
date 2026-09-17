# Phoneme evaluation

Burhan separates speech transcription from pronunciation assessment.

A future acoustic provider can return the phoneme sequence actually produced by the learner. Burhan then aligns that sequence with the expected phoneme sequence.

The evaluator detects:

- substitution
- deletion
- insertion
- exact phoneme matches

The score is an edit-distance-derived diagnostic score, not a Tajweed verdict.

## Integration

POST /api/v1/tajweed-analysis can accept reference_phonemes and predicted_phonemes, together with phoneme_confidence.

The resulting analysis stores the phoneme diagnostics in summary and evidence. The existing teacher-review policy still decides whether the final automated verdict is safe to publish.

Current Iqra'Eval resources provide Quranic-recitation pronunciation datasets and phoneme-oriented models. Burhan keeps the acoustic provider interchangeable rather than coupling the API to one model.
