# Madd acoustic evaluation

Burhan measures madd duration relative to the reader's local timing.

It does not use a fixed number such as "400 ms = 2 harakah" because recitation speed changes the absolute duration.

## Provider observation

A phoneme/acoustic provider can return one observation per mapped madd occurrence.

Example:

~~~json
{
  "occurrence_id": "…",
  "duration_ms": 812,
  "reference_harakah_ms": 395,
  "confidence": 0.94,
  "stop_detected": false
}
~~~

Burhan estimates:

~~~text
estimated_harakah = duration_ms / reference_harakah_ms
~~~

The reference value should be estimated from the same recitation/session, not from a global constant.

## Decision policy

The current v1 evaluator uses a heuristic tolerance band around the configured target. A low-confidence measurement or a measurement outside the band without very strong confidence becomes needs_teacher_review.

madd_arid_lissukun, madd_leen, and madd_iwad are stop-dependent. When the provider cannot establish a stop, Burhan does not issue a duration verdict.

The Madd Profile supplies the expected harakah target for the selected reading route.


## Dedicated acoustic provider

Burhan can use a dedicated HTTPS endpoint for Madd timing.

Example configuration:

~~~text
BURHAN_MADD_ACOUSTIC_PROVIDER_URL=https://your-provider.example/madd
BURHAN_MADD_ACOUSTIC_PROVIDER_TOKEN=...
~~~

The endpoint receives the audio URL, question ID, and the server-generated Madd targets. It returns observations keyed by the mapped occurrence IDs. Burhan remains responsible for loading the reading profile, converting duration to an estimated harakah count, applying the tolerance policy, and deciding whether the result is safe to verify automatically.

When no dedicated provider is configured, Burhan may use madd_observations supplied by the phoneme provider as a fallback.
