# Burhan IqraEval inference service

This service exposes the real IqraEval Quran phoneme model behind a small HTTPS API compatible with Burhan's `runHuggingFacePhonemeProvider`.

## Endpoints

- `GET /health`
- `POST /phonemize`

`POST /phonemize` accepts the raw audio bytes in the request body and returns:

- `predicted_phonemes`
- `phoneme_timings`
- `confidence`
- `audio_quality`
- `summary`

The model is loaded from `/repository`, which is the model mount used by Hugging Face Inference Endpoints custom containers.

## Recommended endpoint configuration

Model repository:

`FatimahEmadEldin/wav2vec2-xls-r-300m-iqraeval`

Custom container port:

`8000`

Health route:

`/health`

Application route:

`/phonemize`

Environment:

`MODEL_PATH=/repository`

Optional shared secret:

`INFERENCE_AUTH_TOKEN=<server-only-token>`

The service uses 12-second chunks with 1.5-second overlap. This is intentional because the model was trained with short utterances and the full Fatiha calibration recording is about 51 seconds.

## Burhan configuration

Set on the Burhan server only:

```env
BURHAN_TAJWEED_PHONEME_PROVIDER=huggingface
BURHAN_HF_PHONEME_ENDPOINT_URL=https://<your-endpoint>/phonemize
BURHAN_HF_PHONEME_MODEL=wav2vec2-xls-r-300m-iqraeval
HF_TOKEN=<server-only-token>
BURHAN_HF_PHONEME_PROVIDER_TOKEN=<optional service token>
```

The current Burhan Hugging Face provider sends the audio as binary with its Content-Type and expects the JSON response fields produced by this service.

## Important

This is an inference service, not a Tajweed-rule detector. Burhan remains responsible for reference phoneme alignment, Madd analysis, evidence generation, and teacher-review decisions.

Do not expose the Hugging Face token or `INFERENCE_AUTH_TOKEN` to browser clients.
