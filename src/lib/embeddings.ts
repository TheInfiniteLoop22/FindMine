import { pipeline, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
import { normalize } from './matching/vector';

/**
 * Real, local, no-API-key ML embeddings via Transformers.js — replaces the old
 * deterministic MD5-hash pseudo-vectors (and the Python FastAPI sidecar that
 * generated them) with genuine semantic embeddings:
 * - Text: Xenova/all-MiniLM-L6-v2 (384-dim), matches Post.textEmbedding's pgvector width.
 * - Image: Xenova/clip-vit-base-patch32 (512-dim), matches Post.imageEmbedding's pgvector width.
 *
 * Models are downloaded once (cached to disk by Transformers.js) and kept warm as
 * module-level singletons for the lifetime of this Node process — cheap on repeat
 * calls, but means the first call after a cold process start is slow (multi-second
 * model load). This only works well in a long-lived process, not a fresh serverless
 * invocation per request.
 */

type FeatureExtractor = Awaited<ReturnType<typeof pipeline<'feature-extraction'>>>;
let textExtractorPromise: Promise<FeatureExtractor> | null = null;

// Transformers.js only defaults to int8 ('q8') weights on the 'wasm' device -
// on Node it auto-selects 'cpu' (via onnxruntime-node), which has no entry in
// its DEFAULT_DEVICE_DTYPE_MAPPING and so silently falls back to full fp32
// weights. CLIP ViT-B/32 in fp32 is large enough (~350MB+ of weights alone,
// before inference buffers) to blow well past what's left of this app's
// 512MB Render instance once Next.js/Prisma/etc.'s own baseline is already
// loaded - which is exactly what was crashing the whole server (OOM-kill)
// on every single post creation, permanently stuck every post's
// embeddingStatus at 'processing'. Forcing 'q8' here cuts model memory
// roughly 4x and must stay explicit - don't remove it "to simplify".
const CPU_DTYPE = 'q8' as const;

// onnxruntime-node's default intra-op thread pool sizes itself to the host's
// detected CPU count, and each thread gets its own execution arena/buffers -
// on a Render free-tier instance (512MB total, shared/throttled vCPU) that
// per-thread overhead was still enough, on top of the q8 models above, to
// OOM-kill the whole process under real load (confirmed live: repeated
// restarts every few minutes while QA-testing post creation). Capping both
// pools to 1 thread trades a bit of inference latency for materially lower
// peak memory, with no effect on embedding accuracy.
const SESSION_OPTIONS = { intraOpNumThreads: 1, interOpNumThreads: 1 } as const;

function getTextExtractor() {
  if (!textExtractorPromise) {
    textExtractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: CPU_DTYPE, session_options: SESSION_OPTIONS });
  }
  return textExtractorPromise;
}

let clipProcessorPromise: ReturnType<typeof AutoProcessor.from_pretrained> | null = null;
let clipVisionModelPromise: ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained> | null = null;

function getClipProcessor() {
  if (!clipProcessorPromise) {
    clipProcessorPromise = AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32');
  }
  return clipProcessorPromise;
}

function getClipVisionModel() {
  if (!clipVisionModelPromise) {
    clipVisionModelPromise = CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32', { dtype: CPU_DTYPE, session_options: SESSION_OPTIONS });
  }
  return clipVisionModelPromise;
}

export async function getTextEmbedding(text: string): Promise<number[]> {
  const extractor = await getTextExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith('data:')) {
    const base64 = imageUrl.split(',')[1] || '';
    return Buffer.from(base64, 'base64');
  }
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status}): ${imageUrl}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function getImageEmbedding(imageUrl: string): Promise<number[]> {
  const rawBuffer = await fetchImageBuffer(imageUrl);

  // Transformers.js's built-in Node image loader throws on RGBA (4-channel) PNGs
  // ("unsupported number of channels: 4") — flattening onto a white background and
  // re-encoding as JPEG via sharp first sidesteps that entirely and normalizes
  // every input format (PNG/WEBP/GIF/base64/etc.) to something it always handles.
  const jpegBuffer = await sharp(rawBuffer).flatten({ background: '#ffffff' }).jpeg().toBuffer();
  const image = (await RawImage.fromBlob(new Blob([new Uint8Array(jpegBuffer)], { type: 'image/jpeg' }))).rgb();

  const processor = await getClipProcessor();
  const visionModel = await getClipVisionModel();
  const inputs = await processor(image);
  const { image_embeds } = await visionModel(inputs);

  return normalize(Array.from(image_embeds.data as Float32Array));
}
