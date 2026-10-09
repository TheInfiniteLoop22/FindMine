/**
 * Pure vector math with no heavy dependencies, used by embeddings.ts to
 * normalize raw CLIP image embeddings before they're stored/compared.
 * Kept in its own dependency-free module (rather than inline in
 * embeddings.ts) so it stays unit-testable without loading
 * @huggingface/transformers or sharp - see src/lib/matching/__tests__/vector.test.ts.
 */
export function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}
