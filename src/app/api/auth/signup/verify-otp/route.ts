import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyEmailOtp, createVerifiedTicket } from '@/lib/emailOtp';
import { checkIpRateLimit, getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';

import { logger } from '@/lib/logger';

const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

// POST /api/auth/signup/verify-otp - Step 2 of email/password sign-up. A 6-digit
// code has far less entropy than a random token, so this is rate-limited harder
// (per email AND per IP) than a typical lookup, on top of the OTP's own 10-minute
// expiry and single-use consumption in emailOtp.ts.
export async function POST(request: Request) {
  try {
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

    const attemptLimit = rateLimit(`signup-otp-verify:${email}`, 5, 10 * 60 * 1000);
    if (!attemptLimit.success) {
      return NextResponse.json(
        { error: 'Too many incorrect attempts. Please request a new code.' },
        { status: 429 }
      );
    }

    const valid = await verifyEmailOtp(email, code);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
    }

    const ticket = await createVerifiedTicket(email);

    return NextResponse.json({ data: { ticket } });
  } catch (error) {
    logger.error('Error verifying signup OTP', { error });
    return NextResponse.json({ error: 'Failed to verify code.' }, { status: 500 });
  }
}
