import { MAX_AUDIO_BYTES, validateAudioUrl } from "./audio-url";

const DEFAULT_MODEL = "gpt-4o-transcribe";

function supportsLogprobs(model: string) {
  return model === "gpt-4o-transcribe" || model === "gpt-4o-mini-transcribe" || model === "gpt-4o-mini-transcribe-2025-12-15";
}

function filenameFromUrl(url: URL, contentType: string | null) {
  const value = url.pathname.split("/").pop();
  if (value && value.includes(".")) return value;

  const extension =
    contentType?.includes("webm") ? "webm"
    : contentType?.includes("wav") ? "wav"
    : contentType?.includes("ogg") ? "ogg"
    : contentType?.includes("mpeg") ? "mp3"
    : "m4a";

  return "recitation." + extension;
}

export type TranscriptionResult = {
  text: string;
  provider: string;
  model: string;
  confidence: number | null;
  duration_seconds: number | null;
  usage: unknown;
  raw_logprobs_count: number;
};

export async function transcribeAudioFromUrl(input: {
  audioUrl: string;
  language?: string;
  model?: string;
}) : Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for audio transcription.");

  const url = validateAudioUrl(input.audioUrl);
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Unable to fetch audio file for transcription: HTTP " + response.status);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large for Burhan v1.");
  }

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error("Audio file is empty.");
  if (buffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large for Burhan v1.");
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), filenameFromUrl(url, contentType));
  const model = input.model ?? process.env.BURHAN_STT_MODEL ?? DEFAULT_MODEL;
  form.append("model", model);
  form.append("language", input.language ?? "ar");
  form.append("response_format", "json");
  if (supportsLogprobs(model)) form.append("include[]", "logprobs");

  const openaiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
    },
    body: form,
    cache: "no-store",
  });

  const payload = await openaiResponse.json().catch(() => null);

  if (!openaiResponse.ok) {
    const message = typeof payload?.error?.message === "string"
      ? payload.error.message
      : "OpenAI transcription failed.";
    throw new Error(message);
  }

  const logprobs = Array.isArray(payload?.logprobs) ? payload.logprobs : [];
  const validLogprobs = logprobs
    .map((item: any) => Number(item?.logprob))
    .filter((value: number) => Number.isFinite(value));

  const confidence = validLogprobs.length
    ? Number(Math.exp(validLogprobs.reduce((sum: number, value: number) => sum + value, 0) / validLogprobs.length).toFixed(4))
    : null;

  return {
    text: typeof payload?.text === "string" ? payload.text : "",
    provider: "openai",
    model,
    confidence,
    duration_seconds: payload?.usage?.type === "duration" ? Number(payload.usage.seconds ?? 0) : null,
    usage: payload?.usage ?? null,
    raw_logprobs_count: logprobs.length,
  };
}
