# Tajweed Knowledge Map

The Tajweed analyzer does not learn the expected rule from the audio alone.

Burhan first builds an expected Quran-side map:

Quran text → rule occurrence → expected behavior → audio analysis

## Current deterministic layer

The knowledge-map layer now covers:

- Noon sakinah and tanween: Izhar, Idgham with ghunnah, Idgham without ghunnah, Iqlab, and Ikhfa.
- Meem sakinah: Shafawi Idgham, Shafawi Ikhfa, and Shafawi Izhar.
- Mushaddad noon/mim ghunnah.
- Qalqalah locations where a sukun mark is explicitly present.
- Lam shamsiyyah and lam qamariyyah.
- Lafz al-Jalalah is mapped separately and remains an acoustic/planned rule.
- Madd map: natural, badal, muttasil, munfasil, kalimi lazim (muthaqqal/mukhaffaf), with conditional occurrences for arid li-sukun, leen, and iwad.

The stored occurrence is deliberately small and model-friendly:

- ayah
- word range
- trigger text
- context text
- expected behavior
- rule code
- map version

## Madd design

The map identifies the expected location and cause of each madd. It does not claim that an audio recording actually produced the required duration.

- Natural madd carries a two-harakah reference in the Hafs-oriented configuration.
- Madd lazim carries a six-harakah reference.
- Muttasil and munfasil duration is left to the configured qira'ah/route profile rather than hard-coded into the audio verdict.
- Arid li-sukun, leen, and iwad are conditional on waqf and therefore require stop-aware audio context.

The distinction between rule location and acoustic measurement is intentional.

The canonical Quran text remains unchanged. The knowledge map is derived metadata only.

## Building the occurrence map

Run `npm run map:tajweed` from a trusted server environment with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The base builder reads all 6,236 ayahs for the core non-madd rules. Run `npm run map:madd` afterward to build the madd occurrences with character spans. Run `npm run check:madd` for the lightweight detector smoke check.

The builder is intentionally server-side because it needs a service-role key to write the protected knowledge map.
