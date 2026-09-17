# Audio Evaluation

Burhan's audio pipeline is split into two stages:

\`\`\`
audio
  ↓
speech-to-text
  ↓
Quran text evaluator
  ↓
per-question / per-ayah score
  ↓
mastery
\`\`\`

## Current transcription provider

Burhan can use OpenAI's Audio Transcriptions API. The current adapter uses \`gpt-4o-transcribe\` by default, sends \`language=ar\`, and requests JSON transcription with token log probabilities.

The OpenAI API currently documents \`POST /audio/transcriptions\` with models including \`gpt-4o-transcribe\`, \`gpt-transcribe\`, and others. It also supports specifying the input language and optional token log probabilities for \`gpt-4o-transcribe\` / \`gpt-4o-mini-transcribe\`.

See the official API reference:
https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create

## Environment

Server-side only:

\`\`\`
OPENAI_API_KEY=...
BURHAN_STT_MODEL=gpt-4o-transcribe
\`\`\`

Optional audio host allowlist:

\`\`\`
BURHAN_AUDIO_ALLOWED_HOSTS=your-storage-host.example.com
\`\`\`

If the allowlist is omitted, Burhan only permits audio URLs whose hostname matches \`SUPABASE_URL\`. This prevents the transcription endpoint from becoming a general-purpose server-side URL fetcher.

## Audio answer endpoint

\`POST /api/v1/tests/:testId/audio-answer\`

The endpoint accepts either:

### Transcript already available

\`\`\`json
{
  "attempt_id": "...",
  "question_id": "...",
  "transcript": "..."
}
\`\`\`

### Audio URL

\`\`\`json
{
  "attempt_id": "...",
  "question_id": "...",
  "audio_url": "https://your-supabase-host/storage/v1/object/sign/..."
}
\`\`\`

When only \`audio_url\` is supplied, Burhan downloads the file from an allowed host, sends it to the configured speech-to-text provider, stores the transcript and transcription metadata, and evaluates the transcript.

Supported audio formats follow the configured transcription provider. The current OpenAI transcription API documents flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, and webm.

## Stored audio metadata

\`burhan_audio_answers\` stores:

- audio URL
- duration
- MIME type
- transcript
- provider/model
- estimated transcription confidence
- language
- evaluation

The same evaluated answer is also stored in \`test_answers\`, so final test submission can reuse the audio transcript rather than overwriting it with an empty answer.

## Important limitation

The current audio score is a **transcript/hifz score**. It does not claim to measure:

- tajwid rules
- makharij
- sifat al-huruf
- madd timing
- ghunnah
- waqf and ibtida
- voice quality

Those require a separate audio-feature / phonetic evaluation layer. The current architecture intentionally keeps that layer independent so it can be added without changing the Quran answer evaluator.
