import { z } from 'zod';

// Shared zod pieces used across multiple API routes, so validation rigor
// stays consistent instead of drifting per-route.

// New uploads always come back as a https://res.cloudinary.com/... secure_url
// from POST /api/upload. Some accounts still have a pre-Cloudinary base64
// data: URI stored from before that migration - accept both so those users
// aren't broken just by re-saving an unrelated field without re-uploading.
const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\/\S+$/;
const LEGACY_BASE64_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export const photoUrlSchema = z
  .string()
  .max(15_000_000, 'Photo is too large.')
  .refine((v) => CLOUDINARY_URL_RE.test(v) || LEGACY_BASE64_IMAGE_RE.test(v), {
    message: 'Photo must be uploaded via the upload button.',
  });

// SHOW_PHONE is kept here only for backward-compat with any pre-existing
// registered items that already used it — the UI no longer offers it as an
// option, and the create/update routes reject it (they require a verified
// phone, which is now impossible to obtain since phone/SMS auth was removed).
export const contactModeSchema = z.enum(['SHOW_PHONE', 'SHOW_EMAIL', 'RELAY_ONLY']);

export const emailFieldSchema = z
  .string()
  .trim()
  .email('Enter a valid email address.')
  .max(254, 'Email address is too long.');

// `phone` is intentionally excluded here — phone/SMS auth and verification
// have been removed from the app entirely; this route must never accept a
// client-declared phone value.
export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(3, 'Display name must be at least 3 characters.').max(50, 'Display name must be at most 50 characters.').optional(),
  photoUrl: photoUrlSchema.nullable().optional(),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters.').nullable().optional(),
});
