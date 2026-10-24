import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyEmailOtp } from '@/lib/emailOtp';
import { checkIpRateLimit, getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';

import { logger } from '@/lib/logger';

const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

// POST /api/profile/email/verify-otp - Step 2 of adding a first verified email
// to an account that doesn't have one yet (see send-otp in this same folder
// for why that's a real, if rare, case). On success this directly updates
// User.email/emailVerified, since registered-items' SHOW_EMAIL contact mode
// requires the submitted email to equal the account's own verified email.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const clientIp = getClientIp(request.headers.get('x-forwarded-for'));
    const ipLimit = checkIpRateLimit(clientIp);
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again shortly.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = verifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { email, code } = parsed.data;

    const attemptLimit = rateLimit(`profile-email-otp-verify:${email}`, 5, 10 * 60 * 1000);
    if (!attemptLimit.success) {
      return NextResponse.json(
        { error: 'Too many incorrect attempts. Please request a new code.' },
        { status: 429 }
      );
    }

    const currentUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!currentUser) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }
    if (currentUser.emailVerified) {
      return NextResponse.json(
        { error: 'Your account already has a verified email address.' },
        { status: 409 }
      );
    }

    const valid = await verifyEmailOtp(email, code);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
    }

    const conflictingUser = await prisma.user.findFirst({
      where: { email, NOT: { id: session.user.id } },
      select: { id: true },
    });
    if (conflictingUser) {
      return NextResponse.json(
        { error: 'This email is already associated with another account.' },
        { status: 409 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { email, emailVerified: new Date() },
      select: { email: true, emailVerified: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Error verifying profile email OTP', { error });
    return NextResponse.json({ error: 'Failed to verify code.' }, { status: 500 });
  }
}
