# Tajweed phoneme provider

Burhan now supports a server-side phoneme provider adapter.

Set:

BURHAN_TAJWEED_PHONEME_PROVIDER_URL=https://your-provider.example/phonemes

Optionally:

BURHAN_TAJWEED_PHONEME_PROVIDER_TOKEN=...

The provider receives:

- audio_url
- reference_phonemes
- question_id

It must return:

- predicted_phonemes
- confidence
- provider
- model

It may also return:

- audio_quality
- tajweed_score
- issue_detected
- evidence
- summary

POST /api/v1/tajweed-analysis/run executes the provider, aligns predicted phonemes with the reference sequence, stores the result, and feeds uncertainty into the teacher-review policy.

Important: a phoneme model alone is a pronunciation layer, not a complete Tajweed judge. If the provider does not return a specialized Tajweed-rule result, Burhan keeps the Tajweed verdict as not_assessed while still storing pronunciation diagnostics.

This separation is intentional. Current Iqra'Eval resources focus on phoneme-level Quranic pronunciation assessment, and their documented phonetizer explicitly does not encode Tajweed rules.


## Madd observations

The provider may also return madd timing observations:

~~~json
{
  "madd_observations": [
    {
      "occurrence_id": "…",
      "duration_ms": 812,
      "reference_harakah_ms": 395,
      "confidence": 0.94,
      "stop_detected": false
    }
  ]
}
~~~

Burhan validates the occurrence IDs against its own Tajweed map and evaluates the duration against the selected Madd Profile. The provider cannot choose or replace the expected Quran-side occurrence.
