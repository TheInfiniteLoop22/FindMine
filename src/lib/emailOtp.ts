import crypto from 'crypto';
import { prisma } from './prisma';
import { hashToken } from './tokens';

/**
 * Custom email-OTP verification, used only during sign-up (replaces Firebase's
 * native link-based email verification for the email/password path — see
 * `src/app/api/auth/signup/*`). Two token types share the existing `SecureToken`
 * table:
 *
 * - EMAIL_OTP: the 6-digit code itself, sent to the user's inbox.
 * - EMAIL_VERIFIED_TICKET: a high-entropy, single-use token issued once the OTP
 *   is confirmed, so the raw OTP never has to be replayed in the final
 *   account-creation request — the client only carries this ticket forward.
 *
 * A 6-digit code has far less entropy than the 32-byte tokens `tokens.ts` uses
 * for password reset, so brute-forcing verify-otp must be rate-limited at the
 * route level (per email AND per IP) — this module only handles storage/
 * comparison, not rate limiting.
 */

const OTP_TYPE = 'EMAIL_OTP';
const TICKET_TYPE = 'EMAIL_VERIFIED_TICKET';
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TICKET_TTL_MS = 15 * 60 * 1000; // 15 minutes

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Generates, stores (hashed), and returns a fresh 6-digit OTP for this email. */
// The hash includes the email: tokenHash is globally unique, so hashing the bare
// 6-digit code made two different emails that were issued the same code at the
// same time collide on the unique index (and made the code alone a lookup key).
function otpHash(email: string, code: string): string {
  return hashToken(`${email}:${code}`);
}

export async function createEmailOtp(email: string): Promise<string> {
  const code = generateOtp();
  const tokenHash = otpHash(email, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.secureToken.deleteMany({ where: { email, type: OTP_TYPE } });
  await prisma.secureToken.create({ data: { tokenHash, email, type: OTP_TYPE, expiresAt } });

  return code;
}

/** Verifies a submitted OTP; single-use (deletes on success, whether valid or expired). */
export async function verifyEmailOtp(email: string, code: string): Promise<boolean> {
  return consumeToken(otpHash(email, code), OTP_TYPE, email);
}

/**
 * Atomically consumes a token: the delete is the claim. Two simultaneous
 * submissions of the same valid code both reach this point, but only one
 * `deleteMany` removes the row (count === 1), so a code can never be used twice.
 */
async function consumeToken(tokenHash: string, type: string, email: string): Promise<boolean> {
  const record = await prisma.secureToken.findUnique({ where: { tokenHash } });
  if (!record || record.type !== type || record.email !== email) {
    return false;
  }

  const { count } = await prisma.secureToken.deleteMany({ where: { id: record.id } });
  if (count !== 1) return false;

  return new Date() <= record.expiresAt;
}

/** Issues a short-lived ticket proving this email was just OTP-verified. */
export async function createVerifiedTicket(email: string): Promise<string> {
  const rawTicket = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawTicket);
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS);

  await prisma.secureToken.deleteMany({ where: { email, type: TICKET_TYPE } });
  await prisma.secureToken.create({ data: { tokenHash, email, type: TICKET_TYPE, expiresAt } });

  return rawTicket;
}

/** Consumes a verified-email ticket; single-use. */
export async function consumeVerifiedTicket(email: string, ticket: string): Promise<boolean> {
  return consumeToken(hashToken(ticket), TICKET_TYPE, email);
}
