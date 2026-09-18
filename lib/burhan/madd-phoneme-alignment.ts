import type { MaddObservation, MaddTarget } from "./madd-acoustic-evaluator";
import type { PhonemeOperation } from "./phoneme-evaluator";
import type { PhonemeTiming } from "./phoneme-provider-contract";

export type MaddPhonemeAlignment = {
  occurrence_id: string;
  expected_phoneme_start: number;
  expected_phoneme_end: number;
  predicted_indices: number[];
  start_ms: number | null;
  end_ms: number | null;
  duration_ms: number | null;
  confidence: number | null;
  status: "aligned" | "partially_aligned" | "not_aligned";
};

function operationsForTarget(
  operations: PhonemeOperation[],
  target: MaddTarget,
) {
  return operations.filter(
    (operation) =>
      operation.expected_index != null &&
      operation.expected_index >= (target.phoneme_start ?? 0) &&
      operation.expected_index < (target.phoneme_end ?? 0) &&
      operation.predicted_index != null,
  );
}

export function alignMaddTargetToPhonemeTimings(input: {
  target: MaddTarget;
  operations: PhonemeOperation[];
  timings: PhonemeTiming[];
}): MaddPhonemeAlignment {
  const expectedStart = input.target.phoneme_start;
  const expectedEnd = input.target.phoneme_end;

  if (
    expectedStart == null ||
    expectedEnd == null ||
    !Number.isInteger(expectedStart) ||
    !Number.isInteger(expectedEnd) ||
    expectedEnd <= expectedStart
  ) {
    return {
      occurrence_id: input.target.occurrence_id,
      expected_phoneme_start: expectedStart ?? -1,
      expected_phoneme_end: expectedEnd ?? -1,
      predicted_indices: [],
      start_ms: null,
      end_ms: null,
      duration_ms: null,
      confidence: null,
      status: "not_aligned",
    };
  }

  const predictedIndices = operationsForTarget(input.operations, input.target)
    .map((operation) => operation.predicted_index as number)
    .filter((index, position, values) => values.indexOf(index) === position)
    .sort((a, b) => a - b);

  const timingByIndex = new Map(
    input.timings.map((timing) => [timing.index, timing]),
  );
  const alignedTimings = predictedIndices
    .map((index) => timingByIndex.get(index))
    .filter((timing): timing is PhonemeTiming => Boolean(timing))
    .sort((a, b) => a.index - b.index);

  if (!alignedTimings.length) {
    return {
      occurrence_id: input.target.occurrence_id,
      expected_phoneme_start: expectedStart,
      expected_phoneme_end: expectedEnd,
      predicted_indices: predictedIndices,
      start_ms: null,
      end_ms: null,
      duration_ms: null,
      confidence: null,
      status: predictedIndices.length ? "partially_aligned" : "not_aligned",
    };
  }

  const startMs = Math.min(...alignedTimings.map((timing) => timing.start_ms));
  const endMs = Math.max(...alignedTimings.map((timing) => timing.end_ms));
  const confidenceValues = alignedTimings
    .map((timing) => timing.confidence)
    .filter((value): value is number => value != null);

  return {
    occurrence_id: input.target.occurrence_id,
    expected_phoneme_start: expectedStart,
    expected_phoneme_end: expectedEnd,
    predicted_indices: predictedIndices,
    start_ms: startMs,
    end_ms: endMs,
    duration_ms: Math.max(0, endMs - startMs),
    confidence: confidenceValues.length
      ? Number(
          (
            confidenceValues.reduce((sum, value) => sum + value, 0) /
            confidenceValues.length
          ).toFixed(4),
        )
      : null,
    status:
      alignedTimings.length === predictedIndices.length
        ? "aligned"
        : "partially_aligned",
  };
}

export function buildMaddTimingObservations(input: {
  targets: MaddTarget[];
  operations: PhonemeOperation[];
  timings: PhonemeTiming[];
  referenceHarakahMs?: number | null;
}): {
  observations: MaddObservation[];
  alignments: MaddPhonemeAlignment[];
} {
  const observations: MaddObservation[] = [];
  const alignments: MaddPhonemeAlignment[] = [];

  for (const target of input.targets) {
    const alignment = alignMaddTargetToPhonemeTimings({
      target,
      operations: input.operations,
      timings: input.timings,
    });

    alignments.push(alignment);

    if (
      alignment.duration_ms == null ||
      alignment.duration_ms <= 0 ||
      alignment.start_ms == null ||
      alignment.end_ms == null
    ) {
      continue;
    }

    const confidence = alignment.confidence ?? 0.5;

    observations.push({
      occurrence_id: target.occurrence_id,
      duration_ms: alignment.duration_ms,
      reference_harakah_ms:
        input.referenceHarakahMs != null && input.referenceHarakahMs > 0
          ? input.referenceHarakahMs
          : undefined,
      confidence,
      start_ms: alignment.start_ms,
      end_ms: alignment.end_ms,
      evidence: {
        measurement_mode: "phoneme_timing_alignment",
        alignment_status: alignment.status,
        expected_phoneme_start: alignment.expected_phoneme_start,
        expected_phoneme_end: alignment.expected_phoneme_end,
        predicted_indices: alignment.predicted_indices,
      },
    });
  }

  return { observations, alignments };
}
