import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signInWithFirebasePassword, FirebaseSignInError } from '@/lib/firebaseAdmin';
import {
  checkIpRateLimit,
  checkAccountLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  getClientIp,
} from '@/lib/security';
import { logger } from '@/lib/logger';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const INVALID_CREDENTIALS = 'Invalid email or password.';

// Firebase reports a wrong password for an existing account, and an unknown email,
// with these codes depending on whether email-enumeration protection is enabled.
// Treat them identically so the response never reveals which accounts exist.
const BAD_CREDENTIAL_CODES = new Set([
  'INVALID_LOGIN_CREDENTIALS',
  'INVALID_PASSWORD',
  'EMAIL_NOT_FOUND',
  'INVALID_EMAIL',
]);

// POST /api/auth/password-signin - the email/password half of sign-in.
//
// The browser used to call Firebase directly, so the server never saw a failed
// password and could not lock anything. Routing the check through here lets the
// existing per-IP limiter and per-account lockout (5 failures -> 15 minutes)
// protect real accounts. On success it returns Firebase's ID token, which the
// client hands to NextAuth's credentials provider exactly as before.
export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request.headers.get('x-forwarded-for'), request.headers.get('cf-connecting-ip'));

    if (!checkIpRateLimit(clientIp).success) {
      return NextResponse.json({ error: 'Too many sign-in attempts. Please try again in a minute.' }, { status: 429 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const lockout = await checkAccountLockout(email);
    if (lockout.blocked) {
      const minutes = Math.max(1, Math.ceil(lockout.remainingMs / 60000));
      return NextResponse.json(
        { error: `Too many failed attempts. This account is temporarily locked - try again in ${minutes} minute(s).` },
        { status: 429 }
      );
    }

    try {
      const { idToken } = await signInWithFirebasePassword(email, password);
      resetFailedAttempts(email);
      return NextResponse.json({ data: { idToken } });
    } catch (err) {
      if (err instanceof FirebaseSignInError) {
        if (BAD_CREDENTIAL_CODES.has(err.code)) {
          await recordFailedAttempt(email);
          return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
        }
        if (err.code === 'USER_DISABLED') {
          return NextResponse.json({ error: 'This account has been disabled. Contact support for help.' }, { status: 403 });
        }
        if (err.code === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
          return NextResponse.json({ error: 'Too many attempts. Please wait a moment and try again.' }, { status: 429 });
        }
      }
      throw err;
    }
  } catch (error) {
    logger.error('Error in password sign-in', { error });
    return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
}
