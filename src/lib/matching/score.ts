/**
 * The weighted lost/found match-score formula, kept as a pure function with
 * no heavy dependencies (no @huggingface/transformers, no sharp, no DB)
 * so it can be unit-tested directly and cheaply (see
 * src/lib/matching/__tests__/score.test.ts) instead of only being
 * eyeballed against live match scores.
 *
 * Mirrors the SQL ORDER BY expression in directRunner.ts's
 * computeMatchesForPost exactly - keep both in sync if either changes.
 * distanceKm is treated as "no proximity credit" once >= proximityWindowKm
 * (default 25), same as the SQL's GREATEST(0, 1 - distance/25000).
 */
export function computeMatchScore({
  imageSim,
  textSim,
  distanceKm,
  categoryMatch,
  proximityWindowKm = 25,
}: {
  imageSim: number;
  textSim: number;
  distanceKm: number;
  categoryMatch: boolean;
  proximityWindowKm?: number;
}): number {
  const proximity = Math.max(0, 1 - distanceKm / proximityWindowKm);
  const rawScore =
    0.35 * imageSim +
    0.2 * textSim +
    0.2 * proximity +
    0.25 * (categoryMatch ? 1 : 0);
  return Math.max(0, Math.min(1, rawScore));
}
