const DEFAULT_MODEL = "gpt-4o-transcribe";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "flac",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "ogg",
  "wav",
  "webm",
]);

function allowedHosts() {
  const configured = process.env.BURHAN_AUDIO_ALLOWED_HOSTS
    ?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (configured?.length) return configured;

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required for audio URL validation.");

  return [new URL(supabaseUrl).hostname.toLowerCase()];
}

function validateAudioUrl(rawUrl: string) {
  const url = new URL(rawUrl);

  if (url.protocol !== "https:") {
    throw new Error("Audio URL must use HTTPS.");
  }

  if (!allowedHosts().includes(url.hostname.toLowerCase())) {
    throw new Error("Audio URL host is not allowed.");
  }

  const extension = url.pathname.split(".").pop()?.toLowerCase();
  if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported audio file extension.");
  }

  return url;
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
  form.append("model", input.model ?? process.env.BURHAN_STT_MODEL ?? DEFAULT_MODEL);
  form.append("language", input.language ?? "ar");
  form.append("response_format", "json");
  form.append("include[]", "logprobs");

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
    model: input.model ?? process.env.BURHAN_STT_MODEL ?? DEFAULT_MODEL,
    confidence,
    duration_seconds: payload?.usage?.type === "duration" ? Number(payload.usage.seconds ?? 0) : null,
    usage: payload?.usage ?? null,
    raw_logprobs_count: logprobs.length,
  };
}
