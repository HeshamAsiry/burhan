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


## Hugging Face Endpoint provider

Set:

~~~text
BURHAN_TAJWEED_PHONEME_PROVIDER=huggingface
BURHAN_HF_PHONEME_ENDPOINT_URL=https://<your-endpoint>
HF_TOKEN=...
BURHAN_HF_PHONEME_MODEL=wav2vec2-xls-r-300m-iqraeval
~~~

The Quran-specific model currently evaluated is FatimahEmadEldin/wav2vec2-xls-r-300m-iqraeval. Its model card states an Apache-2.0 license, a 74-token vocabulary built on 68 phonemes, and phoneme-level CTC inference for Quranic/MSA pronunciation. The model is not currently deployed by an Inference Provider, so a dedicated endpoint is required. The model card reports a blind-test F1 of 0.2020; Burhan therefore does not treat the provider as a final Tajweed authority and keeps human review in the loop.
