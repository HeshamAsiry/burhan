# Burhan audio provider contract

Burhan separates three signals:

1. phoneme recognition and sequence comparison;
2. phoneme timing/alignment;
3. Madd acoustic observations.

When timings are available, Burhan aligns the expected Madd phoneme range to the predicted phoneme indices produced by the sequence comparison. The aligned audio span becomes a measured duration_ms observation. A dedicated Madd acoustic provider may override that derived observation for an occurrence; missing provider observations are filled from the timing alignment when possible.

A provider must not manufacture timing or Madd measurements when it cannot observe them from the audio.

## Phoneme provider request

The provider receives:

    {
      "audio_url": "https://...",
      "reference_phonemes": ["..."],
      "question_id": "uuid",
      "madd_targets": [
        {
          "occurrence_id": "uuid",
          "rule_code": "madd_asli",
          "expected_harakah": [2],
          "measurement_mode": "fixed_harakah",
          "phoneme_start": 12,
          "phoneme_end": 15
        }
      ]
    }

audio_url is server-validated. Reference phonemes come from Burhan's stored Quran reference map.

## Phoneme provider response

Required:

    {
      "provider": "my-provider",
      "model": "my-model",
      "predicted_phonemes": ["..."],
      "confidence": 0.91
    }

Optional:

    {
      "audio_quality": "good",
      "tajweed_score": null,
      "issue_detected": true,
      "evidence": [],
      "summary": {},
      "phoneme_timings": [
        {
          "index": 0,
          "phoneme": "b",
          "start_ms": 120,
          "end_ms": 205,
          "confidence": 0.96
        }
      ],
      "madd_observations": []
    }

Each timing index must refer to the matching element in predicted_phonemes. Burhan validates the index, phoneme identity, bounds, uniqueness, and optional confidence.

Timing entries may be sparse. Missing timing is not converted into an estimated timestamp.

## Madd acoustic provider request

When BURHAN_MADD_ACOUSTIC_PROVIDER_URL is configured, Burhan sends:

    {
      "audio_url": "https://...",
      "question_id": "uuid",
      "madd_targets": [],
      "predicted_phonemes": ["..."],
      "phoneme_timings": []
    }

The phoneme sequence and timings are context for the acoustic provider; they do not replace acoustic measurement.

## Madd acoustic provider response

Return occurrence-level observations:

    {
      "provider": "my-madd-provider",
      "model": "my-model",
      "confidence": 0.94,
      "observations": [
        {
          "occurrence_id": "uuid",
          "duration_ms": 410,
          "reference_harakah_ms": 205,
          "confidence": 0.95,
          "stop_detected": false,
          "start_ms": 1200,
          "end_ms": 1610,
          "evidence": {
            "method": "acoustic-span"
          }
        }
      ]
    }

Burhan converts these observations into Madd measurements using the configured rule profile. An absent observation remains not_assessed.

## Hugging Face adapter

The Hugging Face adapter currently expects a dedicated HTTPS endpoint. The model output must be adapted by that endpoint into the Burhan response contract above.

The public model identifier configured by default is:

    wav2vec2-xls-r-300m-iqraeval

Do not put Hugging Face tokens, Supabase service-role keys, or provider secrets in browser code.

## Derived Madd timing

The route derives Madd timing observations from phoneme_timings and the phoneme edit operations. This is intentionally alignment-based: it measures the audio interval belonging to the Madd target rather than treating the presence of a Madd phoneme as proof of correct duration.

For automatic conversion of milliseconds to harakah, configure the server-only calibration value:

    BURHAN_MADD_REFERENCE_HARAKAH_MS=<positive milliseconds>

If this calibration is not configured and the Madd provider does not return reference_harakah_ms, Burhan still stores the measured acoustic duration and alignment evidence, but the Madd verdict remains not_assessed rather than inventing a duration baseline.
