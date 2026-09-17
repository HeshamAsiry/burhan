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
- Attempts, scoring, mastery and review

## Data source
The initial Quran text and structural metadata will be ingested from a verified source with its required attribution. Tanzil's Uthmani text is one candidate source; its terms require verbatim distribution, attribution, and no modification. See https://tanzil.net/docs/text_license.

## Status
Core database schema is initialized in the Burhan Supabase project. Data ingestion and the first question generator are next.