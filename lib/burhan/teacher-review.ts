export type AutomatedTajweedVerdict =
  | "not_assessed"
  | "verified"
  | "needs_teacher_review"
  | "detected_issue";

export type TeacherReviewDecision = {
  verdictStatus: AutomatedTajweedVerdict;
  requiresTeacherReview: boolean;
  reasons: string[];
};

export type AutomatedTajweedSignals = {
  confidence: number;
  issueDetected: boolean;
  audioQuality: "good" | "unclear" | "poor";
  unresolvedItems?: number;
  conflictingSignals?: number;
};

const LOW_CONFIDENCE = 0.75;
const AUTO_VERIFY_CONFIDENCE = 0.85;
const STRONG_ISSUE_CONFIDENCE = 0.9;

export function decideTeacherReview(
  signals: AutomatedTajweedSignals,
): TeacherReviewDecision {
  const reasons: string[] = [];

  if (signals.audioQuality !== "good") {
    reasons.push(`audio_quality_${signals.audioQuality}`);
  }

  if (signals.confidence < LOW_CONFIDENCE) {
    reasons.push("low_confidence");
  }

  if ((signals.unresolvedItems ?? 0) > 0) {
    reasons.push("unresolved_signals");
  }

  if ((signals.conflictingSignals ?? 0) > 0) {
    reasons.push("conflicting_signals");
  }

  if (reasons.length > 0) {
    return {
      verdictStatus: "needs_teacher_review",
      requiresTeacherReview: true,
      reasons,
    };
  }

  if (signals.issueDetected && signals.confidence >= STRONG_ISSUE_CONFIDENCE) {
    return {
      verdictStatus: "detected_issue",
      requiresTeacherReview: false,
      reasons: [],
    };
  }

  if (!signals.issueDetected && signals.confidence >= AUTO_VERIFY_CONFIDENCE) {
    return {
      verdictStatus: "verified",
      requiresTeacherReview: false,
      reasons: [],
    };
  }

  return {
    verdictStatus: "needs_teacher_review",
    requiresTeacherReview: true,
    reasons: ["uncertain_verdict"],
  };
}
