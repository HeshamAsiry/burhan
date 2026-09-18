# Quran phoneme reference map

Burhan keeps the expected phoneme sequence and its source mappings in a server-side table:

`quran_phoneme_references`

Each row is linked to exactly one Quran ayah and stores:

- phoneme sequence
- phoneme version
- source
- letter-to-phoneme spans
- Tajweed mapping spans

The canonical Quran text remains in `ayahs.text_ar`. The phoneme data is derived metadata.

## Builder

Reference generation is a build-time operation. Burhan runs the pinned `quranic-phonemizer==2.9.0` package directly inside GitHub Actions; it does not call a remote phonemizer API.

The workflow requires only:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Run manually from GitHub Actions:

```text
Build Quran phoneme references
```

The builder resolves each ayah by its canonical `surah_id:ayah_number` reference, generates the phoneme sequence plus rich letter/Tajweed mappings, and upserts the result by `ayah_id`.

The build is considered complete only when all 6,236 Quran ayahs have non-empty references.

## Runtime

The API reads the stored references from `quran_phoneme_references`. It does not regenerate phonemes per request.

This keeps the reference side deterministic and separate from the runtime audio provider:

```text
build time:
GitHub Actions
  ↓
quranic-phonemizer
  ↓
Supabase quran_phoneme_references

runtime:
student audio
  ↓
audio/phoneme provider
  ↓
predicted phonemes
  ↓
compare against stored reference
```

The audio provider remains replaceable. It is responsible for analyzing the student's recording; the Quran-side reference is owned by Burhan's stored dataset.
