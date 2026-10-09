import crypto from 'crypto';
import { prisma } from './prisma';

/**
 * Utility to hash raw tokens
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates and stores a secure single-use password-reset token.
 * Returns the raw token string (which must only be emailed, never logged or saved raw).
 *
 * Email verification used to go through this same mechanism ('EMAIL_VERIFICATION'
 * tokens + a custom /api/auth/verify-email confirm route), but real users are
 * verified via Firebase's own hosted email-link flow instead — that branch was
 * dead code (nothing ever called it) and has been removed. Only the local
 * bcrypt-authenticated seed accounts (which have no Firebase account) go through
 * this token system, for password reset only.
 */
export async function createSecureToken(email: string, type: 'PASSWORD_RESET'): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Clean up any existing tokens of the same type for this email
  await prisma.secureToken.deleteMany({
    where: { email, type },
  });

  // Save the hashed token
  await prisma.secureToken.create({
    data: {
      tokenHash,
      email,
      type,
      expiresAt,
    },
  });

  return rawToken;
}
