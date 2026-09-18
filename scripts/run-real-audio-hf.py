#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

MODEL_ID = os.environ.get(
    "BURHAN_CALIBRATION_MODEL",
    "FatimahEmadEldin/wav2vec2-xls-r-300m-iqraeval",
)


def run_ffmpeg(src: Path, dst: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(src),
            "-ar",
            "16000",
            "-ac",
            "1",
            str(dst),
        ],
        check=True,
    )


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: run-real-audio-hf.py AUDIO_FILE", file=sys.stderr)
        return 2

    source = Path(sys.argv[1]).resolve()
    if not source.is_file():
        print(f"audio file not found: {source}", file=sys.stderr)
        return 2

    import numpy as np
    import soundfile as sf
    import torch
    from transformers import AutoModelForCTC, AutoProcessor

    torch.set_num_threads(max(1, min(2, os.cpu_count() or 2)))

    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "audio.wav"
        run_ffmpeg(source, wav_path)

        waveform, sample_rate = sf.read(str(wav_path), dtype="float32")
        if waveform.ndim > 1:
            waveform = waveform.mean(axis=1)

        audio_duration_ms = float(len(waveform) / sample_rate * 1000.0)

        processor = AutoProcessor.from_pretrained(MODEL_ID)
        model = AutoModelForCTC.from_pretrained(MODEL_ID)
        model.eval()

        inputs = processor(
            waveform,
            sampling_rate=sample_rate,
            return_tensors="pt",
        )

        with torch.inference_mode():
            logits = model(**inputs).logits

        probs = torch.softmax(logits, dim=-1)[0]
        frame_ids = torch.argmax(probs, dim=-1).cpu().numpy()
        frame_conf = torch.max(probs, dim=-1).values.cpu().numpy()

        tokenizer = processor.tokenizer
        tokens = tokenizer.convert_ids_to_tokens(frame_ids.tolist())
        ignore_tokens = {
            tokenizer.pad_token,
            tokenizer.bos_token,
            tokenizer.eos_token,
            "<ctc>",
        }
        ignore_tokens.discard(None)
        boundary_token = "|"

        frame_count = len(tokens)
        frame_duration_ms = audio_duration_ms / max(frame_count, 1)

        groups = []
        current = None

        for frame_index, (token, confidence) in enumerate(
            zip(tokens, frame_conf.tolist())
        ):
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

        phoneme_timings = []
        ctc_segments = []
        predicted_phonemes = []

        for group in groups:
            token = group["token"]
            start_ms = group["start_frame"] * frame_duration_ms
            end_ms = group["end_frame"] * frame_duration_ms
            confidence = group["confidence_sum"] / group["frames"]

            ctc_segments.append(
                {
                    "token": token,
                    "start_ms": round(start_ms, 2),
                    "end_ms": round(end_ms, 2),
                    "confidence": round(confidence, 5),
                }
            )

            if token in ignore_tokens or token == boundary_token:
                continue

            phoneme_timings.append(
                {
                    "index": len(phoneme_timings),
                    "phoneme": token,
                    "start_ms": round(start_ms, 2),
                    "end_ms": round(end_ms, 2),
                    "confidence": round(confidence, 5),
                }
            )
            predicted_phonemes.append(token)

        decoded = processor.batch_decode(
            frame_ids.reshape(1, -1),
            group_tokens=True,
        )[0]

        result = {
            "provider": "huggingface-local",
            "model": MODEL_ID,
            "source_file": str(source),
            "sample_rate": sample_rate,
            "audio_duration_ms": round(audio_duration_ms, 2),
            "frame_count": frame_count,
            "frame_duration_ms": round(frame_duration_ms, 4),
            "decoded": decoded,
            "confidence": round(float(np.mean(frame_conf)), 5),
            "predicted_phonemes": predicted_phonemes,
            "phoneme_timings": phoneme_timings,
            "ctc_segments": ctc_segments,
        }

        Path("calibration-result.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print("Model:", MODEL_ID)
        print("Audio duration (ms):", result["audio_duration_ms"])
        print("Chunks:", result["chunk_count"])
        print("Chunk size (s):", result["chunk_seconds"])
        print("Chunk overlap (s):", result["overlap_seconds"])
        print("Mean frame confidence:", result["confidence"])
        print("Decoded chunks:", len(result["decoded_chunks"]))
        print("Predicted phonemes:", len(predicted_phonemes))
        print("Phoneme timing entries:", len(phoneme_timings))


if __name__ == "__main__":
    raise SystemExit(main())
