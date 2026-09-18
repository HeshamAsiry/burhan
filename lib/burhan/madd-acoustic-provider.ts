import { validateAudioUrl } from "./audio-url";
import type { MaddObservation, MaddTarget } from "./madd-acoustic-evaluator";
import type { PhonemeTiming } from "./phoneme-provider-contract";
import { fetchWithProviderTimeout } from "./provider-fetch";

export type MaddAcousticProviderResult = {
  provider: string;
  model: string;
  observations: MaddObservation[];
  confidence: number;
  summary?: Record<string, unknown>;
};

function endpointUrl() {
  const raw = process.env.BURHAN_MADD_ACOUSTIC_PROVIDER_URL?.trim();
  if (!raw) {
    throw new Error("BURHAN_MADD_ACOUSTIC_PROVIDER_URL is not configured.");
  }

  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("Madd acoustic provider URL must use HTTPS.");
  }

  return url;
}

function asObservation(value: unknown): MaddObservation | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Record<string, unknown>;
  const occurrenceId = String(item.occurrence_id ?? "");
  const durationMs = Number(item.duration_ms);
  const confidence = Number(item.confidence);

  if (!occurrenceId) return null;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  const startMs = item.start_ms == null ? undefined : Number(item.start_ms);
  const endMs = item.end_ms == null ? undefined : Number(item.end_ms);
  if (
    (startMs != null && (!Number.isFinite(startMs) || startMs < 0)) ||
    (endMs != null && (!Number.isFinite(endMs) || endMs <= (startMs ?? -Infinity)))
  ) {
    return null;
  }

  return {
    occurrence_id: occurrenceId,
    duration_ms: durationMs,
    reference_harakah_ms:
      item.reference_harakah_ms == null ? undefined : Number(item.reference_harakah_ms),
    confidence,
    stop_detected:
      typeof item.stop_detected === "boolean" ? item.stop_detected : undefined,
    start_ms: startMs,
    end_ms: endMs,
    evidence:
      item.evidence && typeof item.evidence === "object"
        ? (item.evidence as Record<string, unknown>)
        : undefined,
  };
}

export async function runMaddAcousticProvider(input: {
  audioUrl: string;
  questionId: string;
  targets: MaddTarget[];
  predictedPhonemes?: string[];
  phonemeTimings?: PhonemeTiming[];
}): Promise<MaddAcousticProviderResult> {
  const url = endpointUrl();
  const audioUrl = validateAudioUrl(input.audioUrl);
  const token = process.env.BURHAN_MADD_ACOUSTIC_PROVIDER_TOKEN?.trim();

  const response = await fetchWithProviderTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        question_id: input.questionId,
        madd_targets: input.targets,
        predicted_phonemes: input.predictedPhonemes ?? [],
        phoneme_timings: input.phonemeTimings ?? [],
      }),
      cache: "no-store",
    },
    "BURHAN_MADD_ACOUSTIC_PROVIDER_TIMEOUT_MS",
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).error === "string"
        ? String((payload as Record<string, unknown>).error)
        : "Madd acoustic provider failed.";

    throw new Error(message);
  }

  const targetIds = new Set(input.targets.map((target) => target.occurrence_id));
  const observations = Array.isArray(payload?.observations)
    ? payload.observations
        .map(asObservation)
        .filter((item: MaddObservation | null): item is MaddObservation => item !== null)
        .filter((item: MaddObservation) => targetIds.has(item.occurrence_id))
    : [];

  const confidence =
    typeof payload?.confidence === "number"
      ? Math.min(1, Math.max(0, payload.confidence))
      : observations.length
        ? Number(
            (
              observations.reduce(
                (sum: number, item: MaddObservation) => sum + item.confidence,
                0,
              ) / observations.length
            ).toFixed(4),
          )
        : 0;

  const provider =
    typeof payload?.provider === "string" ? payload.provider : "madd-acoustic-custom";
  const model = typeof payload?.model === "string" ? payload.model : "unknown";

  return {
    provider,
    model,
    observations,
    confidence,
    summary:
      payload?.summary && typeof payload.summary === "object"
        ? (payload.summary as Record<string, unknown>)
        : {},
  };
}
