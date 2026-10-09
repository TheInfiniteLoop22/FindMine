import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { consumeVerifiedTicket } from '@/lib/emailOtp';
import { createFirebaseEmailPasswordUser, deleteFirebaseUser } from '@/lib/firebaseAdmin';
import { checkIpRateLimit, getClientIp } from '@/lib/security';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
const completeSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  ticket: z.string().min(1, 'Verification ticket is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(50),
});

// POST /api/auth/signup/complete - Step 3 (final) of email/password sign-up.
// Consumes the ticket issued by verify-otp (proof the email was just OTP-verified),
// creates the Firebase Auth user server-side via the REST accounts:signUp endpoint,
// and pre-creates the Prisma User row with emailVerified already set — see the
// comment in src/lib/auth.ts's authorizeCredentials for why that's safe to trust
// even though Firebase's own emailVerified flag stays false for this account.
export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request.headers.get('x-forwarded-for'));

    const ipLimit = checkIpRateLimit(clientIp);
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again shortly.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, ticket, password, displayName } = parsed.data;

    const ticketValid = await consumeVerifiedTicket(email, ticket);
    if (!ticketValid) {
      return NextResponse.json(
        { error: 'Your email verification expired. Please restart sign-up.', code: 'TICKET_INVALID' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Try signing in instead.', code: 'EMAIL_EXISTS' },
        { status: 409 }
      );
    }

    let firebaseAccount;
    try {
      firebaseAccount = await createFirebaseEmailPasswordUser(email, password);
    } catch (err: unknown) {
      return NextResponse.json({ error: getErrorMessage(err, 'Failed to create account.') }, { status: 400 });
    }

    try {
      await prisma.user.create({
        data: {
          email,
          displayName,
          emailVerified: new Date(),
        },
      });
    } catch (err: unknown) {
      // The Firebase account already exists at this point — if we don't also roll
      // it back here, a DB failure leaves an orphaned Firebase account with no
      // matching User row, which is permanently stuck (can't sign up again since
      // Firebase already has the email; can't sign in either, since Firebase's own
      // emailVerified stays false for these OTP-verified accounts).
      await deleteFirebaseUser(firebaseAccount.idToken);
      logger.error('Error creating User row after Firebase account was created; rolled back', { email, error: err });
      return NextResponse.json({ error: 'Failed to create account.' }, { status: 500 });
    }

    return NextResponse.json({ data: { idToken: firebaseAccount.idToken } }, { status: 201 });
  } catch (error) {
    logger.error('Error completing signup', { error });
    return NextResponse.json({ error: 'Failed to create account.' }, { status: 500 });
  }
}
