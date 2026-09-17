export type DifficultyFeatures = {
  occurrenceCount: number;
  anchorWordCount: number;
  anchorCharCount: number;
  requestedAyahs: number;
  similarityGroupSize?: number;
  transitionDistance?: number;
};

export function scoreDifficulty(features: DifficultyFeatures): number {
  let score = 1;

  // More competing occurrences make anchor recall harder.
  if (features.occurrenceCount >= 3) score += 1;
  if (features.occurrenceCount >= 6) score += 1;
  if (features.occurrenceCount >= 10) score += 1;

  // Longer requested passages increase recall load.
  if (features.requestedAyahs >= 2) score += 1;
  if (features.requestedAyahs >= 4) score += 1;

  // Very short anchors are usually less distinctive.
  if (features.anchorWordCount === 1 && features.anchorCharCount <= 5) score += 1;

  if ((features.similarityGroupSize ?? 0) >= 3) score += 1;
  if ((features.similarityGroupSize ?? 0) >= 6) score += 1;

  if ((features.transitionDistance ?? 0) >= 2) score += 1;
  if ((features.transitionDistance ?? 0) >= 5) score += 1;

  return Math.min(7, Math.max(1, score));
}

export function anchorWordCount(normalizedAnchor: string): number {
  return normalizedAnchor.trim().split(/\s+/).filter(Boolean).length;
}
