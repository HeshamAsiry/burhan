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
CHUNK_SECONDS = 12.0
OVERLAP_SECONDS = 1.5


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


def collapse_ctc(tokens, confidences):
    groups = []
    current = None

    for frame_index, (token, confidence) in enumerate(
        zip(tokens, confidences)
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

    return groups


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

        print("Loading processor:", MODEL_ID)
        processor = AutoProcessor.from_pretrained(MODEL_ID)
        print("Loading model:", MODEL_ID)
        model = AutoModelForCTC.from_pretrained(MODEL_ID)
        model.eval()

        tokenizer = processor.tokenizer
        ignore_tokens = {
            tokenizer.pad_token,
            tokenizer.bos_token,
            tokenizer.eos_token,
            "<ctc>",
        }
        ignore_tokens.discard(None)
        boundary_token = "|"

        chunk_samples = int(CHUNK_SECONDS * sample_rate)
        step_samples = int((CHUNK_SECONDS - OVERLAP_SECONDS) * sample_rate)

        chunk_results = []
        all_timings = []
        all_ctc_segments = []
        all_frame_conf = []

        chunk_starts = list(range(0, len(waveform), step_samples))
        for chunk_number, chunk_start_sample in enumerate(chunk_starts, start=1):
            chunk_end_sample = min(
                len(waveform),
                chunk_start_sample + chunk_samples,
            )
            chunk = waveform[chunk_start_sample:chunk_end_sample]

            chunk_start_ms = chunk_start_sample / sample_rate * 1000.0
            chunk_duration_ms = len(chunk) / sample_rate * 1000.0
            is_first = chunk_start_sample == 0
            is_last = chunk_end_sample == len(waveform)

            inputs = processor(
                chunk,
                sampling_rate=sample_rate,
                return_tensors="pt",
            )

            with torch.inference_mode():
                logits = model(**inputs).logits

            probs = torch.softmax(logits, dim=-1)[0]
            frame_ids = torch.argmax(probs, dim=-1).cpu().numpy()
            frame_conf = torch.max(probs, dim=-1).values.cpu().numpy()
            tokens = tokenizer.convert_ids_to_tokens(frame_ids.tolist())

            frame_count = len(tokens)
            frame_duration_ms = chunk_duration_ms / max(frame_count, 1)
            groups = collapse_ctc(tokens, frame_conf.tolist())

            left_guard_ms = 0.0 if is_first else OVERLAP_SECONDS * 500.0
            right_guard_ms = 0.0 if is_last else OVERLAP_SECONDS * 500.0
            keep_start_ms = left_guard_ms
            keep_end_ms = chunk_duration_ms - right_guard_ms

            chunk_timings = []
            chunk_tokens = []

            for group in groups:
                token = group["token"]
                start_local_ms = group["start_frame"] * frame_duration_ms
                end_local_ms = group["end_frame"] * frame_duration_ms
                center_local_ms = (start_local_ms + end_local_ms) / 2.0
                confidence = group["confidence_sum"] / group["frames"]

                if center_local_ms < keep_start_ms or center_local_ms >= keep_end_ms:
                    continue

                start_ms = chunk_start_ms + start_local_ms
                end_ms = chunk_start_ms + end_local_ms

                segment = {
                    "token": token,
                    "start_ms": round(start_ms, 2),
                    "end_ms": round(end_ms, 2),
                    "confidence": round(confidence, 5),
                }
                all_ctc_segments.append(segment)
                chunk_timings.append(segment)

                if token in ignore_tokens or token == boundary_token:
                    continue

                phone = {
                    "phoneme": token,
                    "start_ms": round(start_ms, 2),
                    "end_ms": round(end_ms, 2),
                    "confidence": round(confidence, 5),
                }
                all_timings.append(phone)
                chunk_tokens.append(token)

            all_frame_conf.extend(frame_conf.tolist())

            chunk_decoded = processor.batch_decode(
                frame_ids.reshape(1, -1),
                group_tokens=True,
            )[0]

            chunk_results.append(
                {
                    "chunk": chunk_number,
                    "start_ms": round(chunk_start_ms, 2),
                    "end_ms": round(chunk_start_ms + chunk_duration_ms, 2),
                    "decoded": chunk_decoded,
                    "phoneme_count": len(chunk_tokens),
                    "frame_count": frame_count,
                }
            )

            print(
                f"Chunk {chunk_number}/{len(chunk_starts)}:",
                f"{chunk_start_ms:.0f}-{chunk_start_ms + chunk_duration_ms:.0f} ms",
                f"phonemes={len(chunk_tokens)}",
            )

        all_timings.sort(key=lambda item: (item["start_ms"], item["end_ms"]))
        phoneme_timings = [
            {
                "index": index,
                **item,
            }
            for index, item in enumerate(all_timings)
        ]
        predicted_phonemes = [
            item["phoneme"] for item in phoneme_timings
        ]

        result = {
            "provider": "huggingface-local",
            "model": MODEL_ID,
            "source_file": str(source),
            "sample_rate": sample_rate,
            "audio_duration_ms": round(audio_duration_ms, 2),
            "chunk_seconds": CHUNK_SECONDS,
            "overlap_seconds": OVERLAP_SECONDS,
            "chunk_count": len(chunk_results),
            "decoded_chunks": chunk_results,
            "confidence": round(float(np.mean(all_frame_conf)), 5),
            "predicted_phonemes": predicted_phonemes,
            "phoneme_timings": phoneme_timings,
            "ctc_segments": all_ctc_segments,
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
        print("Predicted phonemes:", len(predicted_phonemes))
        print("Phoneme timing entries:", len(phoneme_timings))


if __name__ == "__main__":
    raise SystemExit(main())
