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
Core Quran data and knowledge-map layers are initialized in the Burhan Supabase project. The API includes question generation, cumulative/non-cumulative blueprints, text-answer evaluation, persisted attempts, per-ayah scoring, learner mastery/review scheduling, identify-surah and MCQ questions, audio transcription-backed recitation evaluation, and the first Tajweed teacher-review infrastructure.

The Tajweed layer is intentionally separated from speech-to-text. Its current foundation stores automated analysis, confidence, evidence, verdict status, and teacher decisions without pretending that transcript scoring alone measures pronunciation or Tajweed.

## Teacher review
Automated Tajweed analysis can produce:
- verified
- detected issue
- needs teacher review
- not assessed

See docs/teacher-review.md for the review policy and API endpoints.
