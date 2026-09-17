# Quran phoneme reference map

Burhan keeps the expected phoneme sequence in a server-only table:

quran_phoneme_references

Each row is linked to exactly one Quran ayah and stores:

- phoneme sequence
- phoneme version
- source

The canonical Quran text remains in ayahs.text_ar. The phoneme sequence is derived metadata.

## Builder

Configure a trusted phonemizer endpoint:

BURHAN_PHONEMIZER_URL=https://your-phonemizer.example/phonemize
BURHAN_PHONEMIZER_TOKEN=...

Then run:

npm run map:phonemes

The endpoint receives:

{
  "text_ar": "fully vowelized Quran text",
  "surah_id": 2,
  "ayah_number": 4
}

It must return:

{
  "phonemes": ["..."],
  "phoneme_version": "…",
  "source": "…"
}

The builder validates that all 6,236 ayahs have a non-empty phoneme sequence before considering the import complete.

Do not point this at an unlicensed copy of a research phonetizer. The source and license of the phonemizer must be suitable for the way Burhan and its client applications are distributed.

Iqra'Eval documents a 68-phoneme inventory for Qur'anic/MSA pronunciation work and notes that reference phonemes are generated from fully vowelized text. Burhan keeps this reference generation behind an interchangeable provider so the dataset/source can be changed without changing the API model.
