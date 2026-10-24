import { describe, it, expect } from 'vitest';
import { computeMatchScore } from '../score';

// Mirrors the weighted formula in computeMatchesForPost's SQL ORDER BY:
//   0.35 * image_sim + 0.20 * text_sim + 0.20 * proximity + 0.25 * category_match
// See directRunner.ts's own comment for why this is kept as a pure,
// separately-tested function instead of only living inline in SQL.

describe('computeMatchScore', () => {
  it('scores a perfect match (identical image/text, same spot, same category) as 1', () => {
    const score = computeMatchScore({
      imageSim: 1,
      textSim: 1,
      distanceKm: 0,
      categoryMatch: true,
    });
    expect(score).toBeCloseTo(1, 10);
  });

  it('scores a total non-match (opposite embeddings, far away, different category) as 0', () => {
    const score = computeMatchScore({
      imageSim: 0,
      textSim: 0,
      distanceKm: 1000,
      categoryMatch: false,
    });
    expect(score).toBe(0);
  });

  it('weights image similarity more heavily than text similarity', () => {
    // distanceKm beyond the proximity window so that term contributes 0,
    // isolating just the image-vs-text weighting.
    const imageHeavy = computeMatchScore({ imageSim: 1, textSim: 0, distanceKm: 1000, categoryMatch: false });
    const textHeavy = computeMatchScore({ imageSim: 0, textSim: 1, distanceKm: 1000, categoryMatch: false });
    expect(imageHeavy).toBeGreaterThan(textHeavy);
    expect(imageHeavy).toBeCloseTo(0.35, 10);
    expect(textHeavy).toBeCloseTo(0.2, 10);
  });

  it('gives full proximity credit inside the window and zero credit at/after it', () => {
    const atSource = computeMatchScore({ imageSim: 0, textSim: 0, distanceKm: 0, categoryMatch: false });
    const atEdge = computeMatchScore({ imageSim: 0, textSim: 0, distanceKm: 25, categoryMatch: false });
    const beyondEdge = computeMatchScore({ imageSim: 0, textSim: 0, distanceKm: 100, categoryMatch: false });
    expect(atSource).toBeCloseTo(0.2, 10);
    expect(atEdge).toBe(0); // proximity term floors at 0, doesn't go negative
    expect(beyondEdge).toBe(0);
  });

  it('proximity credit decays linearly within the window', () => {
    const halfway = computeMatchScore({ imageSim: 0, textSim: 0, distanceKm: 12.5, categoryMatch: false });
    expect(halfway).toBeCloseTo(0.1, 10); // half of the 0.2 proximity weight
  });

  it('adds a flat 0.25 credit for a category match, independent of other terms', () => {
    const withCategory = computeMatchScore({ imageSim: 0, textSim: 0, distanceKm: 1000, categoryMatch: true });
    const withoutCategory = computeMatchScore({ imageSim: 0, textSim: 0, distanceKm: 1000, categoryMatch: false });
    expect(withCategory - withoutCategory).toBeCloseTo(0.25, 10);
  });

  it('respects a custom proximity window', () => {
    const score = computeMatchScore({ imageSim: 0, textSim: 0, distanceKm: 5, categoryMatch: false, proximityWindowKm: 10 });
    expect(score).toBeCloseTo(0.1, 10); // 0.2 * (1 - 5/10)
  });

  it('clamps the result to [0, 1] even if inputs are out of the normal range', () => {
    const overOne = computeMatchScore({ imageSim: 1, textSim: 1, distanceKm: -100, categoryMatch: true });
    expect(overOne).toBeLessThanOrEqual(1);

    const underZero = computeMatchScore({ imageSim: -1, textSim: -1, distanceKm: 1_000_000, categoryMatch: false });
    expect(underZero).toBeGreaterThanOrEqual(0);
  });

  it('matches a known worked example by hand', () => {
    // image_sim=0.9, text_sim=0.8, distance=5km (of 25km window), same category
    // = 0.35*0.9 + 0.20*0.8 + 0.20*(1-5/25) + 0.25*1
    // = 0.315 + 0.16 + 0.16 + 0.25 = 0.885
    const score = computeMatchScore({ imageSim: 0.9, textSim: 0.8, distanceKm: 5, categoryMatch: true });
    expect(score).toBeCloseTo(0.885, 10);
  });
});
