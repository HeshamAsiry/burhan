export type PhonemeTiming = {
  index: number;
  phoneme: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
};

export function parsePhonemeTimings(
  value: unknown,
  predictedPhonemes: string[],
): PhonemeTiming[] {
  if (value == null) return [];

  if (!Array.isArray(value)) {
    throw new Error("Tajweed phoneme provider returned invalid phoneme_timings.");
  }

  const seen = new Set<number>();

  return value
    .map((item: unknown, position): PhonemeTiming => {
      if (!item || typeof item !== "object") {
        throw new Error(
          "Tajweed phoneme provider returned invalid phoneme_timings item at index " +
            position +
            ".",
        );
      }

      const object = item as Record<string, unknown>;
      const index = Number(object.index);
      const phoneme = typeof object.phoneme === "string" ? object.phoneme.trim() : "";
      const startMs = Number(object.start_ms);
      const endMs = Number(object.end_ms);
      const confidence =
        object.confidence == null ? undefined : Number(object.confidence);

      if (!Number.isInteger(index) || index < 0 || index >= predictedPhonemes.length) {
        throw new Error(
          "Tajweed phoneme provider returned an invalid phoneme timing index at position " +
            position +
            ".",
        );
      }

      if (seen.has(index)) {
        throw new Error(
          "Tajweed phoneme provider returned duplicate phoneme timing index " +
            index +
            ".",
        );
      }
      seen.add(index);

      if (!phoneme || phoneme !== predictedPhonemes[index]) {
        throw new Error(
          "Tajweed phoneme provider phoneme timing does not match predicted_phonemes at index " +
            index +
            ".",
        );
      }

      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        startMs < 0 ||
        endMs <= startMs
      ) {
        throw new Error(
          "Tajweed phoneme provider returned invalid phoneme timing bounds at index " +
            index +
            ".",
        );
      }

      if (
        confidence != null &&
        (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
      ) {
        throw new Error(
          "Tajweed phoneme provider returned invalid phoneme timing confidence at index " +
            index +
            ".",
        );
      }

      return {
        index,
        phoneme,
        start_ms: startMs,
        end_ms: endMs,
        ...(confidence == null ? {} : { confidence }),
      };
    })
    .sort((a, b) => a.index - b.index);\n}
