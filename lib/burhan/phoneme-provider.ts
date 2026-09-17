import { validateAudioUrl } from "./audio-url";

export type PhonemeProviderResult = {
  provider: string;
  model: string;
  predicted_phonemes: string[];
  confidence: number;
  audio_quality?: "good" | "unclear" | "poor";
  tajweed_score?: number | null;
  issue_detected?: boolean;
  evidence?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
};

function providerUrl() {
  const value = process.env.BURHAN_TAJWEED_PHONEME_PROVIDER_URL?.trim();
  if (!value) {
    throw new Error("BURHAN_TAJWEED_PHONEME_PROVIDER_URL is not configured.");
  }

  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Tajweed phoneme provider URL must use HTTPS.");
  }

  return url;
}

export async function runPhonemeProvider(input: {
  audioUrl: string;
  referencePhonemes: string[];
  questionId: string;
}): Promise<PhonemeProviderResult> {
  const url = providerUrl();
  validateAudioUrl(input.audioUrl);
  const token = process.env.BURHAN_TAJWEED_PHONEME_PROVIDER_TOKEN;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify({
      audio_url: input.audioUrl,
      reference_phonemes: input.referencePhonemes,
      question_id: input.questionId,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : "Tajweed phoneme provider failed.";
    throw new Error(message);
  }

  if (!Array.isArray(payload?.predicted_phonemes)) {
    throw new Error("Tajweed phoneme provider returned no predicted_phonemes.");
  }

  const confidence = Number(payload.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Tajweed phoneme provider returned an invalid confidence.");
  }

  const tajweedScore =
    payload.tajweed_score == null ? null : Number(payload.tajweed_score);

  if (
    tajweedScore != null &&
    (!Number.isFinite(tajweedScore) || tajweedScore < 0 || tajweedScore > 100)
  ) {
    throw new Error("Tajweed phoneme provider returned an invalid tajweed_score.");
  }

  return {
    provider: typeof payload.provider === "string" ? payload.provider : "custom",
    model: typeof payload.model === "string" ? payload.model : "unknown",
    predicted_phonemes: payload.predicted_phonemes.map((value: unknown) => String(value)),
    confidence,
    audio_quality:
      payload.audio_quality === "unclear" || payload.audio_quality === "poor"
        ? payload.audio_quality
        : "good",
    tajweed_score: tajweedScore,
    issue_detected:
      typeof payload.issue_detected === "boolean"
        ? payload.issue_detected
        : undefined,
    evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
    summary:
      payload.summary && typeof payload.summary === "object"
        ? payload.summary
        : {},
  };
}
