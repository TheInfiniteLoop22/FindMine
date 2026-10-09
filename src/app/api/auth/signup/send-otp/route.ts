import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { createEmailOtp } from '@/lib/emailOtp';
import { checkIpRateLimit, getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';

import { logger } from '@/lib/logger';

const sendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(50),
});

// POST /api/auth/signup/send-otp - Step 1 of email/password sign-up: send a 6-digit
// verification code to the given email. Public/unauthenticated by necessity (the
// account doesn't exist yet), so both an IP limit and a per-email limit apply.
export async function POST(request: Request) {
  try {
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

    const { email, displayName } = parsed.data;

    const emailLimit = rateLimit(`signup-otp-send:${email}`, 3, 60 * 60 * 1000);
    if (!emailLimit.success) {
      return NextResponse.json(
        { error: 'Too many verification codes requested for this email. Please try again in an hour.' },
        { status: 429 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Try signing in instead.', code: 'EMAIL_EXISTS' },
        { status: 409 }
      );
    }

    const code = await createEmailOtp(email);

    const result = await sendEmail({
      to: email,
      subject: 'Your FindMine verification code',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #4f46e5;">Verify your email</h2>
          <p>Hi ${displayName},</p>
          <p>Use this code to finish creating your FindMine account:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">${code}</p>
          <p style="font-size: 12px; color: #94a3b8;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });

    // sendEmail() catches its own errors and returns success:false rather than
    // throwing (so a transient Resend outage doesn't 500 the whole request by
    // default) - but that means silently ignoring the result here would report
    // "Verification code sent." even when nothing was actually delivered (e.g.
    // Resend's sandbox mode rejecting a recipient that isn't the account's own
    // verified address). Surface that as a real failure instead of a lie.
    if (!result.success) {
      return NextResponse.json(
        { error: 'Could not send the verification email. Please try again shortly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ message: 'Verification code sent.' });
  } catch (error) {
    logger.error('Error sending signup OTP', { error });
    return NextResponse.json({ error: 'Failed to send verification code.' }, { status: 500 });
  }
}
