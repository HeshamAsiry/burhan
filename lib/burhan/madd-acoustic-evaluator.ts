export type MaddTarget = {
  occurrence_id: string;
  rule_code: string;
  expected_harakah: number[];
  measurement_mode: "fixed_harakah" | "route_profile" | "contextual";
  condition?: "waqf" | "always";
  requires_stop?: boolean;
  notes?: string | null;
};

export type MaddObservation = {
  occurrence_id: string;
  duration_ms: number;
  reference_harakah_ms?: number;
  confidence: number;
  stop_detected?: boolean;
  start_ms?: number;
  end_ms?: number;
  evidence?: Record<string, unknown>;
};

export type MaddMeasurement = {
  occurrence_id: string;
  rule_code: string;
  observed_duration_ms: number | null;
  reference_harakah_ms: number | null;
  estimated_harakah: number | null;
  expected_harakah: number[];
  deviation_percent: number | null;
  measurement_confidence: number | null;
  stop_detected: boolean | null;
  status: "verified" | "detected_issue" | "needs_teacher_review" | "not_assessed";
  reasons: string[];
  evidence: Record<string, unknown>;
};

const REVIEW_CONFIDENCE = 0.8;
const AUTO_VERIFY_CONFIDENCE = 0.9;
const AUTO_ISSUE_CONFIDENCE = 0.95;

function tolerance(expected: number) {
  return Math.max(0.5, expected * 0.18);
}

function nearestExpected(value: number, expected: number[]) {
  return expected.reduce(
    (best, candidate) =>
      Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
    expected[0] ?? value,
  );
}

export function evaluateMaddObservation(
  target: MaddTarget,
  observation: MaddObservation | undefined,
): MaddMeasurement {
  if (!observation) {
    return {
      occurrence_id: target.occurrence_id,
      rule_code: target.rule_code,
      observed_duration_ms: null,
      reference_harakah_ms: null,
      estimated_harakah: null,
      expected_harakah: target.expected_harakah,
      deviation_percent: null,
      measurement_confidence: null,
      stop_detected: null,
      status: "not_assessed",
      reasons: ["no_madd_observation"],
      evidence: {},
    };
  }

  const reasons: string[] = [];

  if (
    target.condition === "waqf" &&
    target.requires_stop &&
    observation.stop_detected !== true
  ) {
    reasons.push("waqf_required");
  }

  if (!Number.isFinite(observation.duration_ms) || observation.duration_ms <= 0) {
    reasons.push("invalid_duration");
  }

  const referenceMs = observation.reference_harakah_ms ?? null;

  if (referenceMs == null || !Number.isFinite(referenceMs) || referenceMs <= 0) {
    return {
      occurrence_id: target.occurrence_id,
      rule_code: target.rule_code,
      observed_duration_ms: observation.duration_ms,
      reference_harakah_ms: null,
      estimated_harakah: null,
      expected_harakah: target.expected_harakah,
      deviation_percent: null,
      measurement_confidence: observation.confidence,
      stop_detected: observation.stop_detected ?? null,
      status: "not_assessed",
      reasons: [...reasons, "missing_harakah_reference"],
      evidence: observation.evidence ?? {},
    };
  }

  if (
    !Number.isFinite(observation.confidence) ||
    observation.confidence < 0 ||
    observation.confidence > 1
  ) {
    reasons.push("invalid_measurement_confidence");
  }

  if (reasons.length) {
    return {
      occurrence_id: target.occurrence_id,
      rule_code: target.rule_code,
      observed_duration_ms: observation.duration_ms,
      reference_harakah_ms: referenceMs,
      estimated_harakah: null,
      expected_harakah: target.expected_harakah,
      deviation_percent: null,
      measurement_confidence: observation.confidence,
      stop_detected: observation.stop_detected ?? null,
      status: "not_assessed",
      reasons,
      evidence: observation.evidence ?? {},
    };
  }

  if (!target.expected_harakah.length) {
    return {
      occurrence_id: target.occurrence_id,
      rule_code: target.rule_code,
      observed_duration_ms: observation.duration_ms,
      reference_harakah_ms: referenceMs,
      estimated_harakah: null,
      expected_harakah: [],
      deviation_percent: null,
      measurement_confidence: observation.confidence,
      stop_detected: observation.stop_detected ?? null,
      status: "not_assessed",
      reasons: ["no_profile_duration_target"],
      evidence: observation.evidence ?? {},
    };
  }

  const validatedReferenceMs: number = referenceMs;
  const estimatedHarakah = observation.duration_ms / validatedReferenceMs;
  const expected = nearestExpected(estimatedHarakah, target.expected_harakah);
  const deviationPercent =
    Number((((estimatedHarakah - expected) / expected) * 100).toFixed(2));

  const withinBand =
    Math.abs(estimatedHarakah - expected) <= tolerance(expected);

  const status =
    observation.confidence < REVIEW_CONFIDENCE
      ? "needs_teacher_review"
      : withinBand
        ? observation.confidence >= AUTO_VERIFY_CONFIDENCE
          ? "verified"
          : "needs_teacher_review"
        : observation.confidence >= AUTO_ISSUE_CONFIDENCE
          ? "detected_issue"
          : "needs_teacher_review";

  if (!withinBand) reasons.push("duration_outside_expected_band");
  if (observation.confidence < REVIEW_CONFIDENCE) reasons.push("low_confidence");
  if (status === "needs_teacher_review" && reasons.length === 0) {
    reasons.push("measurement_uncertain");
  }

  return {
    occurrence_id: target.occurrence_id,
    rule_code: target.rule_code,
    observed_duration_ms: observation.duration_ms,
    reference_harakah_ms: referenceMs,
    estimated_harakah: Number(estimatedHarakah.toFixed(3)),
    expected_harakah: target.expected_harakah,
    deviation_percent: deviationPercent,
    measurement_confidence: observation.confidence,
    stop_detected: observation.stop_detected ?? null,
    status,
    reasons,
    evidence: {
      ...(observation.evidence ?? {}),
      tolerance_harakah: tolerance(expected),
      expected_nearest: expected,
    },
  };
}

export function evaluateMaddObservations(
  targets: MaddTarget[],
  observations: MaddObservation[],
): MaddMeasurement[] {
  const observationByOccurrence = new Map(
    observations.map((observation) => [observation.occurrence_id, observation]),
  );

  return targets.map((target) =>
    evaluateMaddObservation(
      target,
      observationByOccurrence.get(target.occurrence_id),
    ),
  );
}

export function summarizeMaddMeasurements(measurements: MaddMeasurement[]) {
  return {
    total: measurements.length,
    verified: measurements.filter((item) => item.status === "verified").length,
    detected_issues: measurements.filter((item) => item.status === "detected_issue").length,
    needs_teacher_review: measurements.filter(
      (item) => item.status === "needs_teacher_review",
    ).length,
    not_assessed: measurements.filter((item) => item.status === "not_assessed").length,
  };
}
