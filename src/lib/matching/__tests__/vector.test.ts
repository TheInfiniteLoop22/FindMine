import { describe, it, expect } from 'vitest';
import { normalize } from '../vector';

// normalize() is the pure vector-math step applied to raw CLIP image
// embeddings before they're stored/compared (see getImageEmbedding).
// Text embeddings are already normalized by the extractor itself
// (`{ normalize: true }`), so this only needs to be re-verified here.

describe('normalize', () => {
  it('scales a vector to unit length (L2 norm of 1)', () => {
    const result = normalize([3, 4]); // 3-4-5 triangle, norm = 5
    expect(result).toEqual([0.6, 0.8]);
    const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  it('leaves an already-unit vector unchanged', () => {
    const result = normalize([1, 0, 0]);
    expect(result[0]).toBeCloseTo(1, 10);
    expect(result[1]).toBeCloseTo(0, 10);
    expect(result[2]).toBeCloseTo(0, 10);
  });

  it('preserves direction (sign) of each component', () => {
    const result = normalize([-3, 4]);
    expect(result[0]).toBeLessThan(0);
    expect(result[1]).toBeGreaterThan(0);
  });

  it('does not divide by zero for an all-zero vector', () => {
    // norm would be 0; implementation falls back to dividing by 1 instead
    // of NaN-ing every component out.
    const result = normalize([0, 0, 0]);
    expect(result).toEqual([0, 0, 0]);
    expect(result.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('normalizes a higher-dimensional vector correctly', () => {
    const input = [1, 2, 2]; // norm = 3
    const result = normalize(input);
    expect(result[0]).toBeCloseTo(1 / 3, 10);
    expect(result[1]).toBeCloseTo(2 / 3, 10);
    expect(result[2]).toBeCloseTo(2 / 3, 10);
  });
});
