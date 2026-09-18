import io
import math
import os
import subprocess
import tempfile
from typing import Any

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, Header, HTTPException, Request
from transformers import AutoModelForCTC, AutoProcessor


MODEL_PATH = os.environ.get("MODEL_PATH", "/repository").strip() or "/repository"
MODEL_NAME = os.environ.get(
    "MODEL_NAME",
    "FatimahEmadEldin/wav2vec2-xls-r-300m-iqraeval",
)
MAX_AUDIO_BYTES = int(os.environ.get("MAX_AUDIO_BYTES", str(20 * 1024 * 1024)))
CHUNK_SECONDS = float(os.environ.get("CHUNK_SECONDS", "12"))
OVERLAP_SECONDS = float(os.environ.get("OVERLAP_SECONDS", "1.5"))
PORT = int(os.environ.get("PORT", "8000"))
AUTH_TOKEN = os.environ.get("INFERENCE_AUTH_TOKEN", "").strip()

if CHUNK_SECONDS <= 0 or CHUNK_SECONDS > 14.5:
    raise RuntimeError("CHUNK_SECONDS must be > 0 and <= 14.5.")
if OVERLAP_SECONDS < 0 or OVERLAP_SECONDS >= CHUNK_SECONDS:
    raise RuntimeError("OVERLAP_SECONDS must be >= 0 and less than CHUNK_SECONDS.")

app = FastAPI(title="Burhan IqraEval phoneme service", version="1.0.0")

processor = None
model = None


def run_ffmpeg(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as source_file:
        source_path = source_file.name
        source_file.write(audio_bytes)

    wav_path = source_path + ".wav"

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                source_path,
                "-ar",
                "16000",
                "-ac",
                "1",
                wav_path,
            ],
            check=True,
        )
        waveform, sample_rate = sf.read(wav_path, dtype="float32")
        if waveform.ndim > 1:
            waveform = waveform.mean(axis=1)
        if not len(waveform):
            raise ValueError("Decoded audio is empty.")
        return waveform, int(sample_rate)
    finally:
        for path in (source_path, wav_path):
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass


def collapse_ctc(tokens: list[str], confidences: list[float]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    current = None

    for frame_index, (token, confidence) in enumerate(zip(tokens, confidences)):
        if current is not None and token == current["token"]:
            current["end_frame"] = frame_index + 1
            current["confidence_sum"] += float(confidence)
            current["frames"] += 1
            continue

        if current is not None:
            groups.append(current)

        current = {
            "token": token,
            "start_frame": frame_index,
            "end_frame": frame_index + 1,
            "confidence_sum": float(confidence),
            "frames": 1,
        }

    if current is not None:
        groups.append(current)

    return groups


def ensure_model() -> tuple[Any, Any]:
    global processor, model

    if processor is None or model is None:
        processor = AutoProcessor.from_pretrained(MODEL_PATH)
        model = AutoModelForCTC.from_pretrained(MODEL_PATH)
        model.eval()

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device)
    return processor, model


@app.on_event("startup")
def load_model() -> None:
    ensure_model()


@app.get("/health")
def health() -> dict[str, Any]:
    loaded = processor is not None and model is not None
    return {
        "status": "ok" if loaded else "initializing",
        "model": MODEL_NAME,
        "model_path": MODEL_PATH,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "ready": loaded,
    }


@app.post("/phonemize")
async def phonemize(request: Request, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if AUTH_TOKEN:
        expected = "Bearer " + AUTH_TOKEN
        if authorization != expected:
            raise HTTPException(status_code=401, detail="Unauthorized.")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Audio body is empty.")
    if len(body) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file is too large.")

    try:
        audio, sample_rate = run_ffmpeg(body)
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=400, detail="Unable to decode audio.") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to read audio.") from exc

    processor_instance, model_instance = ensure_model()
    tokenizer = processor_instance.tokenizer

    ignore_tokens = {
        tokenizer.pad_token,
        tokenizer.bos_token,
        tokenizer.eos_token,
        "<ctc>",
    }
    ignore_tokens.discard(None)
    boundary_token = "|"

    chunk_samples = max(1, int(CHUNK_SECONDS * sample_rate))
    step_samples = max(1, int((CHUNK_SECONDS - OVERLAP_SECONDS) * sample_rate))

    all_timings: list[dict[str, Any]] = []
    all_frame_confidence: list[float] = []
    chunks: list[dict[str, Any]] = []

    device = next(model_instance.parameters()).device
    inference_dtype = torch.float32

    for chunk_number, chunk_start in enumerate(
        range(0, len(audio), step_samples),
        start=1,
    ):
        chunk_end = min(len(audio), chunk_start + chunk_samples)
        chunk = audio[chunk_start:chunk_end]

        if len(chunk) == 0:
            continue

        chunk_start_ms = chunk_start / sample_rate * 1000.0
        chunk_duration_ms = len(chunk) / sample_rate * 1000.0
        is_first = chunk_start == 0
        is_last = chunk_end == len(audio)

        inputs = processor_instance(
            chunk,
            sampling_rate=sample_rate,
            return_tensors="pt",
        )
        input_values = inputs.input_values.to(device=device, dtype=inference_dtype)

        model_inputs = {"input_values": input_values}
        if "attention_mask" in inputs:
            model_inputs["attention_mask"] = inputs.attention_mask.to(device)

        with torch.inference_mode():
            logits = model_instance(**model_inputs).logits

        probs = torch.softmax(logits.float(), dim=-1)[0]
        frame_ids = torch.argmax(probs, dim=-1).cpu().numpy()
        frame_confidence = torch.max(probs, dim=-1).values.cpu().numpy()
        tokens = tokenizer.convert_ids_to_tokens(frame_ids.tolist())

        frame_count = len(tokens)
        frame_duration_ms = chunk_duration_ms / max(frame_count, 1)
        groups = collapse_ctc(tokens, frame_confidence.tolist())

        left_guard_ms = 0.0 if is_first else OVERLAP_SECONDS * 500.0
        right_guard_ms = 0.0 if is_last else OVERLAP_SECONDS * 500.0
        keep_start_ms = left_guard_ms
        keep_end_ms = chunk_duration_ms - right_guard_ms

        kept = 0
        for group in groups:
            token = group["token"]
            start_local_ms = group["start_frame"] * frame_duration_ms
            end_local_ms = group["end_frame"] * frame_duration_ms
            center_local_ms = (start_local_ms + end_local_ms) / 2.0

            if center_local_ms < keep_start_ms or center_local_ms >= keep_end_ms:
                continue

            start_ms = chunk_start_ms + start_local_ms
            end_ms = chunk_start_ms + end_local_ms
            confidence = group["confidence_sum"] / group["frames"]

            if token in ignore_tokens or token == boundary_token:
                continue

            all_timings.append(
                {
                    "phoneme": token,
                    "start_ms": round(start_ms, 2),
                    "end_ms": round(end_ms, 2),
                    "confidence": round(confidence, 5),
                }
            )
            kept += 1

        all_frame_confidence.extend(frame_confidence.tolist())
        chunks.append(
            {
                "chunk": chunk_number,
                "start_ms": round(chunk_start_ms, 2),
                "end_ms": round(chunk_start_ms + chunk_duration_ms, 2),
                "phoneme_count": kept,
                "frame_count": frame_count,
            }
        )

    all_timings.sort(key=lambda item: (item["start_ms"], item["end_ms"]))
    phoneme_timings = [
        {"index": index, **item}
        for index, item in enumerate(all_timings)
    ]

    predicted_phonemes = [item["phoneme"] for item in phoneme_timings]
    confidence = (
        float(np.mean(all_frame_confidence))
        if all_frame_confidence
        else 0.0
    )

    if not predicted_phonemes:
        raise HTTPException(status_code=422, detail="No phonemes detected.")

    duration_ms = len(audio) / sample_rate * 1000.0

    return {
        "provider": "huggingface-iqraeval",
        "model": MODEL_NAME,
        "text": " ".join(predicted_phonemes),
        "predicted_phonemes": predicted_phonemes,
        "phoneme_timings": phoneme_timings,
        "confidence": round(confidence, 5),
        "audio_quality": "good" if confidence >= 0.85 else "unclear",
        "summary": {
            "sample_rate": sample_rate,
            "audio_duration_ms": round(duration_ms, 2),
            "chunk_seconds": CHUNK_SECONDS,
            "overlap_seconds": OVERLAP_SECONDS,
            "chunk_count": len(chunks),
            "chunks": chunks,
            "timing_source": "ctc-frame-collapse",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
