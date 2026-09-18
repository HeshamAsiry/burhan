# Real Audio Calibration

This is the first live-audio calibration case for Burhan.

## Calibration case

- Test ID: `b0000000-0000-4000-8000-000000000001`
- Question ID: `b0000000-0000-4000-8000-000000000002`
- Attempt ID: `b0000000-0000-4000-8000-000000000003`
- Ayah: Surah Al-Fatihah, ayah 4
- Ayah text: `مَـٰلِكِ يَوْمِ ٱلدِّينِ`
- Primary Madd target: `madd_asli`

The attempt is dedicated to calibration and does not belong to a learner account.

## 1. Upload a real recording

The API requires the normal Burhan API key.

```bash
curl -X POST "$BURHAN_API_URL/api/v1/audio/upload" \
  -H "x-burhan-api-key: $BURHAN_API_KEY" \
  -F "attempt_id=b0000000-0000-4000-8000-000000000003" \
  -F "question_id=b0000000-0000-4000-8000-000000000002" \
  -F "file=@./fatiha-1-4.wav;type=audio/wav"
```

The response contains a private signed `audio_url` valid for one hour.

Supported live-test audio formats are:

- flac
- mp3
- mp4
- ogg
- wav
- webm
- m4a

Maximum size: 20 MB.

## One-command live test

Once `BURHAN_API_URL` and `BURHAN_API_KEY` are set, you can upload a local recording and run the full analysis in one command:

```bash
export BURHAN_API_URL="https://your-burhan-api.example.com"
export BURHAN_API_KEY="..." 
npm run audio:real -- ./fatiha-1-4.wav
```

The command uploads the recording, obtains the private signed URL, calls Tajweed analysis, and prints the complete JSON response. It uses the dedicated calibration Attempt/Question by default.

## 2. Send the signed audio URL to Tajweed analysis

Copy the `audio_url` from the upload response.

```bash
curl -X POST "$BURHAN_API_URL/api/v1/tajweed-analysis/run" \
  -H "Content-Type: application/json" \
  -H "x-burhan-api-key: $BURHAN_API_KEY" \
  -d '{
    "attempt_id": "b0000000-0000-4000-8000-000000000003",
    "question_id": "b0000000-0000-4000-8000-000000000002",
    "audio_url": "PASTE_SIGNED_AUDIO_URL_HERE"
  }'
```

## 3. What to record first

The first calibration recording should be a clean, natural recitation of:

`مَـٰلِكِ يَوْمِ ٱلدِّينِ`

Use one speaker, quiet surroundings, a stable microphone position, and no processing that changes timing.

After the baseline recording, collect additional recordings that intentionally vary the Madd duration while keeping the rest of the recitation as consistent as possible.

## 4. What to inspect

Save these fields for every recording:

- `provider`
- `phonemes`
- `phonemes.operations`
- `provider.confidence`
- `madd.summary`
- `madd.measurements`
- `review`
- `analysis.summary.madd.reference_harakah_ms`
- `analysis.summary.madd.timing_aligned_count`

For Madd calibration, compare the measured `observed_duration_ms` against the teacher's judgment of the intended duration.

Do not change the thresholds after a single recording. Calibration should use several clean recordings first.

## Required server configuration

```env
BURHAN_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

BURHAN_TAJWEED_PHONEME_PROVIDER=custom
BURHAN_TAJWEED_PHONEME_PROVIDER_URL=...
BURHAN_TAJWEED_PHONEME_PROVIDER_TOKEN=...

# Recommended once a stable baseline is measured
BURHAN_MADD_REFERENCE_HARAKAH_MS=...
```

Never put `SUPABASE_SERVICE_ROLE_KEY`, provider tokens, or `BURHAN_API_KEY` in browser code.
