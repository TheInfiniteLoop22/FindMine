import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { createSecureToken } from '@/lib/tokens';
import { sendFirebasePasswordResetEmail } from '@/lib/firebaseAdmin';
import { checkIpRateLimit, isCaptchaRequired, verifyCaptcha, getClientIp } from '@/lib/security';

import { logger } from '@/lib/logger';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  captchaToken: z.string().optional(),
});

// POST /api/auth/forgot-password - Secure forgot-password flow preventing user enumeration
export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request.headers.get('x-forwarded-for'));

    // 1. IP Rate Limiting Check
    const ipLimit = checkIpRateLimit(clientIp);
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many attempts, try again later' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, captchaToken } = parsed.data;

    // 2. CAPTCHA Check
    if (isCaptchaRequired(clientIp, email)) {
      const captchaValid = await verifyCaptcha(captchaToken || '');
      if (!captchaValid) {
        return NextResponse.json({ error: 'CAPTCHA verification required' }, { status: 403 });
      }
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      if (user.isSeedAccount) {
        // Seed/demo accounts authenticate against local passwordHash (no Firebase
        // account exists for them) — issue our own single-use reset token.
        const rawToken = await createSecureToken(email, 'PASSWORD_RESET');
        const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

        await sendEmail({
          to: user.email,
          subject: '[FindMine] Password Reset Request',
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
              <h2 style="color: #4f46e5;">Password Reset Request</h2>
              <p>Hello <strong>${user.displayName}</strong>,</p>
              <p>Click the link below to choose a new password. This link expires in 1 hour and can only be used once.</p>
              <p style="margin: 24px 0;">
                <a href="${resetLink}" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Reset Password
                </a>
              </p>
              <p>If you did not request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } else {
        // Real accounts authenticate via Firebase (email/password, Google, or phone) —
        // Firebase owns the password, so trigger its own hosted reset-email flow rather
        // than resetting a passwordHash column that sign-in never actually checks.
        await sendFirebasePasswordResetEmail(email);
      }
    }

    // Always respond with the exact same message regardless of whether user exists
    return NextResponse.json({
      message: 'If an account exists for this email, a reset link has been sent.',
    });
  } catch (error) {
    logger.error('Forgot-password error', { error });
    return NextResponse.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    );
  }
}
