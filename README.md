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
Core Quran data and knowledge-map layers are initialized in the Burhan Supabase project. The API includes question generation, cumulative/non-cumulative blueprints, text-answer evaluation, persisted attempts, per-ayah scoring, learner mastery/review scheduling, identify-surah and MCQ questions, audio transcription-backed recitation evaluation, a populated deterministic Tajweed knowledge map, phoneme alignment, and teacher-review infrastructure.

The Tajweed layer is intentionally separated from speech-to-text. The current foundation stores expected rule occurrences, phoneme diagnostics, automated analysis, confidence, evidence, verdict status, and teacher decisions without pretending that transcript scoring alone measures pronunciation or Tajweed.

## Teacher review
Automated Tajweed analysis can produce:
- verified
- detected issue
- needs teacher review
- not assessed

See docs/teacher-review.md for the review policy and API endpoints.


## Current Tajweed map

The Supabase project contains the core Tajweed rule catalog and a populated derived knowledge map. Madd now has dedicated detection logic for natural, badal, muttasil, munfasil, and kalimi lazim patterns, with conditional map entries for arid li-sukun, leen, and iwad. Additional special Madd rules are cataloged for later contextual detection. Acoustic duration measurement is intentionally a separate layer.

Server-side phoneme references are modeled in quran_phoneme_references. The table remains empty until a suitable, licensed reference-phoneme source is configured. A server-side builder is included as npm run map:phonemes.


## Audio/Tajweed configuration

For speech-to-text, configure OPENAI_API_KEY on the server.

For a Quran phoneme endpoint, configure BURHAN_TAJWEED_PHONEME_PROVIDER=huggingface together with BURHAN_HF_PHONEME_ENDPOINT_URL and HF_TOKEN, or use the custom provider adapter.

For generating the Quran phoneme reference map, configure BURHAN_PHONEMIZER_URL and optionally BURHAN_PHONEMIZER_TOKEN, BURHAN_PHONEMIZER_VERSION, and BURHAN_PHONEMIZER_SOURCE, then run npm run map:phonemes from a trusted server environment.

Never expose service-role keys or provider tokens to browser clients.
