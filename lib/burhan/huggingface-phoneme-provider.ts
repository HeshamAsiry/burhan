import { validateAudioUrl, MAX_AUDIO_BYTES } from "./audio-url";
import type { MaddObservation, MaddTarget } from "./madd-acoustic-evaluator";
import {
  parsePhonemeTimings,
  type PhonemeTiming,
} from "./phoneme-provider-contract";

export type HuggingFacePhonemeResult = {
  provider: "huggingface";
  model: string;
  predicted_phonemes: string[];
  phoneme_timings: PhonemeTiming[];
  confidence: number;
  audio_quality?: "good" | "unclear" | "poor";
  madd_observations?: MaddObservation[];
  summary?: Record<string, unknown>;
};

function endpointUrl() {
  const raw = process.env.BURHAN_HF_PHONEME_ENDPOINT_URL?.trim();
  if (!raw) {
    throw new Error("BURHAN_HF_PHONEME_ENDPOINT_URL is not configured.");
  }

  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("Hugging Face phoneme endpoint must use HTTPS.");
  }

  return url;
}

function tokenizePhonemeText(value: string) {
  return value
    .trim()
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function confidenceFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return 0.5;

  const object = payload as Record<string, unknown>;

  if (typeof object.confidence === "number") {
    return Math.min(1, Math.max(0, object.confidence));
  }

  if (Array.isArray(object.chunks)) {
    const scores = object.chunks
      .map((chunk) =>
        chunk && typeof chunk === "object"
          ? Number((chunk as Record<string, unknown>).score)
          : NaN,
      )
      .filter((score) => Number.isFinite(score) && score >= 0 && score <= 1);

    if (scores.length) {
      return Number(
        (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(4),
      );
    }
  }

  return 0.5;
}

export async function runHuggingFacePhonemeProvider(input: {
  audioUrl: string;
  questionId: string;
  referencePhonemes: string[];
  maddTargets?: MaddTarget[];
}): Promise<HuggingFacePhonemeResult> {
  void input.questionId;
  void input.referencePhonemes;

  const url = endpointUrl();
  const audioUrl = validateAudioUrl(input.audioUrl);
  const token = process.env.HF_TOKEN?.trim();

  if (!token) {
    throw new Error("HF_TOKEN is not configured.");
  }

  const audioResponse = await fetch(audioUrl, { cache: "no-store" });

  if (!audioResponse.ok) {
    throw new Error(
      "Unable to fetch audio for Hugging Face inference: HTTP " +
        audioResponse.status,
    );
  }

  const contentLength = Number(audioResponse.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large for Burhan v1.");
  }

  const audioBuffer = await audioResponse.arrayBuffer();
  if (!audioBuffer.byteLength) {
    throw new Error("Audio file is empty.");
  }

  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large for Burhan v1.");
  }

  const contentType =
    audioResponse.headers.get("content-type")?.split(";")[0] ||
    "audio/wav";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": contentType,
      Accept: "application/json",
    },
    body: audioBuffer,
    cache: "no-store",
  });

  const payload = await response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return text ? { text } : null;
  });

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).error === "string"
        ? String((payload as Record<string, unknown>).error)
        : "Hugging Face phoneme endpoint failed.";

    throw new Error(message);
  }

  const textValue =
    payload && typeof payload === "object"
      ? typeof (payload as Record<string, unknown>).text === "string"
        ? String((payload as Record<string, unknown>).text)
        : ""
      : typeof payload === "string"
        ? payload
        : "";

  const predictedPhonemes = tokenizePhonemeText(textValue);

  if (!predictedPhonemes.length) {
    throw new Error(
      "Hugging Face phoneme endpoint returned no phoneme sequence.",
    );
  }

  const phonemeTimings = parsePhonemeTimings(
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).phoneme_timings
      : undefined,
    predictedPhonemes,
  );

  const confidence = confidenceFromPayload(payload);
  const model =
    process.env.BURHAN_HF_PHONEME_MODEL?.trim() ||
    "wav2vec2-xls-r-300m-iqraeval";

  return {
    provider: "huggingface",
    model,
    predicted_phonemes: predictedPhonemes,
    phoneme_timings: phonemeTimings,
    confidence,
    audio_quality: confidence >= 0.85 ? "good" : "unclear",
    madd_observations: [],
    summary: {
      endpoint: url.hostname,
      model,
      reference_phoneme_count: input.referencePhonemes.length,
      madd_target_count: input.maddTargets?.length ?? 0,
      confidence_source:
        typeof (payload as Record<string, unknown> | null)?.confidence ===
        "number"
          ? "provider"
          : Array.isArray((payload as Record<string, unknown> | null)?.chunks)
            ? "chunk_scores"
            : "fallback_0.5",
    },
  };
}
