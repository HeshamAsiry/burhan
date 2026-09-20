# Burhan API

Independent Quran memorization assessment API.

## Purpose
Burhan provides a reusable engine for generating and evaluating structured Quran memorization tests. It is independent of Riwaq and can be consumed by Riwaq or any other client.

## Core concepts
- Quran knowledge base
- Anchor-based occurrence recall
- Recitation ranges
- Mutashabihat
- Progressive difficulty levels 1–7
- Cumulative and non-cumulative tests
- Attempts, text-answer scoring, mastery and review
- Audio transcription and recitation evaluation
- Independent Tajweed analysis with teacher review fallback

## Data source
The canonical Quran text is sourced from Tanzil's Uthmani text under its terms of use. Burhan keeps the canonical Arabic text verbatim and uses normalized representations only for search/evaluation. See https://tanzil.net/docs/text_license.

## Status
Core Quran data and knowledge-map layers are initialized in the Burhan Supabase project. The API includes question generation, cumulative/non-cumulative blueprints, text-answer evaluation, persisted attempts, per-ayah scoring, learner mastery/review scheduling, identify-surah and MCQ questions, audio recitation evaluation, a populated deterministic Tajweed knowledge map, stored Quran phoneme references, phoneme error evidence, and teacher-review infrastructure.

The Tajweed layer is intentionally separated from speech-to-text. Transcript/phoneme scoring and Tajweed-rule analysis are separate signals, with explicit confidence and teacher-review states.

## Teacher review
Automated Tajweed analysis can produce:
- verified
- detected issue
- needs teacher review
- not assessed

See docs/teacher-review.md for the review policy and API endpoints.

## Current Tajweed map
The Supabase project contains the core Tajweed rule catalog and a populated derived knowledge map. Madd has dedicated detection logic for natural, badal, muttasil, munfasil, and kalimi lazim patterns, with conditional map entries for arid li-sukun, leen, and iwad. Acoustic duration measurement remains a separate layer.

## Quran phoneme references
public.quran_phoneme_references contains the stored Quran phoneme reference map. The current build contains 6,236 ayah references using quranic-phonemizer==2.9.0.

The reference builder is a manual, build-time workflow. Runtime audio evaluation reads the stored references and does not call an external Quran phonemizer.

Build/rebuild locally from a trusted server environment with:

    npm run map:phonemes

The GitHub Actions workflow .github/workflows/map-phonemes.yml can run the same builder in controlled batches with the Supabase service-role secret.

## Audio/Tajweed configuration
For speech-to-text, configure OPENAI_API_KEY on the server.

For a Quran phoneme endpoint, configure:

    BURHAN_TAJWEED_PHONEME_PROVIDER=huggingface
    BURHAN_HF_PHONEME_ENDPOINT_URL=https://<your-endpoint>
    HF_TOKEN=<server-only-token>
    BURHAN_HF_PHONEME_MODEL=wav2vec2-xls-r-300m-iqraeval

A custom provider can be used instead with BURHAN_TAJWEED_PHONEME_PROVIDER=custom and BURHAN_TAJWEED_PHONEME_PROVIDER_URL.

The normalized provider response is expected to contain predicted_phonemes and confidence. It may also return phoneme_timings, where each timing identifies the predicted phoneme index with start_ms, end_ms, and optional confidence. Burhan validates those timings and stores them with the audio evaluation for later alignment/acoustic analysis.

Madd acoustic measurements can be supplied separately through BURHAN_MADD_ACOUSTIC_PROVIDER_URL; this provider returns occurrence-level duration observations and is the signal used for Madd duration verification. When a dedicated Madd observation is missing, Burhan can derive an acoustic duration from validated phoneme timings aligned to the Madd phoneme span. Set BURHAN_MADD_REFERENCE_HARAKAH_MS on the server to calibrate that measured duration into harakah; without it, the duration is retained as evidence but is not auto-graded.

Never expose service-role keys or provider tokens to browser clients.
## v1 API contract

Base URL (production): `https://burhan-4iamegla0-airy5.vercel.app`

### Authentication
All `/api/v1/*` endpoints except `/api/v1/health` require a Burhan API key. Send either:

    Authorization: Bearer <BURHAN_API_KEY>

or:

    X-Burhan-API-Key: <BURHAN_API_KEY>

API keys are stored hashed in `burhan_api_keys`; the raw key must remain server-side and must never be shipped in a browser client.

### Health

    GET /api/v1/health

Returns a lightweight service health response and does not require authentication.

### Generate a test

    POST /api/v1/tests/generate

Example request:

    {
      "juz": 30,
      "style": "burhan_itqan",
      "test_number": 1,
      "question_count": 10,
      "persist": true
    }

For `burhan_itqan`, Burhan generates the question mix from the selected Juz and test number. Recitation ranges preserve Quran order and can cross surah boundaries. Range prompts identify both endpoints by the beginning of their ayahs, e.g. `«وَبَنَيْنَا فَوْقَكُمْ…»`, not by the final words of the ending ayah.

### Retrieve a generated test

    GET /api/v1/tests/:testId

The public test representation returns prompts, positions, question types, difficulty, and MCQ options without exposing the stored expected answers.

### Standard errors

- `401 UNAUTHORIZED` — missing or invalid API key.
- `429 RATE_LIMITED` — API-key request limit exceeded.
- `400 INVALID_REQUEST` — request body failed validation.
- `404 TEST_NOT_FOUND` — requested test does not exist.
- `500 TEST_GENERATION_ERROR` — generation failed after request validation.

### Production readiness

The current production deployment is connected to `HeshamAsiry/burhan` and deploys from `main`. The health endpoint has been verified with HTTP 200, and protected API routes reject unauthenticated requests with HTTP 401.

The current v1 scope is **test generation and retrieval**. Audio/recitation evaluation remains a separate future layer and is not required by the current test-generation API.
\n