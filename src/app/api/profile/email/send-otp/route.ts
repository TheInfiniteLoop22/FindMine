import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { createEmailOtp } from '@/lib/emailOtp';
import { checkIpRateLimit, getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';

import { logger } from '@/lib/logger';

const sendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
});

// POST /api/profile/email/send-otp - Lets a signed-in account that has no
// verified email yet (an edge case now that phone/SMS sign-up is gone -
// every normal sign-up path already ends with a verified email) add and
// verify one, e.g. to use the "Reveal Email Address" contact mode on a
// registered item. Reuses the same OTP primitives as sign-up
// (src/lib/emailOtp.ts) rather than a second implementation.
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
    const parsed = sendOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { email } = parsed.data;

    const emailLimit = rateLimit(`profile-email-otp-send:${email}`, 3, 60 * 60 * 1000);
    if (!emailLimit.success) {
      return NextResponse.json(
        { error: 'Too many verification codes requested for this email. Please try again in an hour.' },
        { status: 429 }
      );
    }

    const currentUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!currentUser) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    // Only for accounts that don't already have a verified email — this route
    // adds a first one, it doesn't swap out an existing verified address.
    if (currentUser.emailVerified) {
      return NextResponse.json(
        { error: 'Your account already has a verified email address.' },
        { status: 409 }
      );
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

    const code = await createEmailOtp(email);

    const result = await sendEmail({
      to: email,
      subject: 'Verify your email — FindMine',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #4f46e5;">Verify your email</h2>
          <p>Hi ${currentUser.displayName},</p>
          <p>Use this code to verify this email address for your FindMine account:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">${code}</p>
          <p style="font-size: 12px; color: #94a3b8;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Could not send the verification email. Please try again shortly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ message: 'Verification code sent.' });
  } catch (error) {
    logger.error('Error sending profile email OTP', { error });
    return NextResponse.json({ error: 'Failed to send verification code.' }, { status: 500 });
  }
}
