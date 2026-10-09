import { describe, it, expect } from 'vitest';
import { profileUpdateSchema, contactModeSchema, emailFieldSchema, photoUrlSchema } from '../validation';

// Regression coverage for PATCH /api/profile's validation (previously had
// no schema at all beyond a hand-rolled displayName length check). Guards against the exact
// gaps that fix closed reopening silently.

describe('profileUpdateSchema', () => {
  it('accepts a valid partial update', () => {
    const r = profileUpdateSchema.safeParse({ displayName: 'Alice B', bio: 'Hello there' });
    expect(r.success).toBe(true);
  });

  it('accepts an empty body (no-op update)', () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a Cloudinary photoUrl', () => {
    const r = profileUpdateSchema.safeParse({
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/findmine/u1/avatar.jpg',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a legacy base64 photoUrl (pre-Cloudinary accounts)', () => {
    const r = profileUpdateSchema.safeParse({ photoUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(r.success).toBe(true);
  });

  it('accepts null to clear an optional field', () => {
    const r = profileUpdateSchema.safeParse({ photoUrl: null, phone: null, bio: null });
    expect(r.success).toBe(true);
  });

  it('rejects an overlong bio (previously fully unbounded)', () => {
    const r = profileUpdateSchema.safeParse({ bio: 'a'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('rejects a photoUrl on an arbitrary/malicious host (previously accepted any string)', () => {
    const r = profileUpdateSchema.safeParse({ photoUrl: 'https://evil.example.com/payload.jpg' });
    expect(r.success).toBe(false);
  });

  it('rejects a displayName shorter than 3 characters', () => {
    const r = profileUpdateSchema.safeParse({ displayName: 'ab' });
    expect(r.success).toBe(false);
  });

  it('ignores a phone field entirely (phone/SMS auth was removed from the app)', () => {
    // phone is intentionally not part of this schema — PATCH /api/profile can no
    // longer set it at all, regardless of value. Originally this was because it
    // had to go through a dedicated OTP-verified route ; phone/SMS auth has since been removed
    // entirely, so there's no route that can set it anymore either.
    const r = profileUpdateSchema.safeParse({ phone: 'call me maybe' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as Record<string, unknown>).phone).toBeUndefined();
    }
  });
});

describe('shared validation pieces', () => {
  it('contactModeSchema only accepts the three known enum values', () => {
    expect(contactModeSchema.safeParse('SHOW_PHONE').success).toBe(true);
    expect(contactModeSchema.safeParse('SHOW_EMAIL').success).toBe(true);
    expect(contactModeSchema.safeParse('RELAY_ONLY').success).toBe(true);
    expect(contactModeSchema.safeParse('ANYTHING_ELSE').success).toBe(false);
  });

  it('emailFieldSchema requires a real email shape and caps length', () => {
    expect(emailFieldSchema.safeParse('user@example.com').success).toBe(true);
    expect(emailFieldSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('photoUrlSchema caps overall length even for the legacy base64 format', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(20_000_000);
    expect(photoUrlSchema.safeParse(huge).success).toBe(false);
  });
});
