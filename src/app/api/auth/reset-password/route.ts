import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { hashToken } from '@/lib/tokens';
import { resetFailedAttempts, checkIpRateLimit, getClientIp } from '@/lib/security';

import { logger } from '@/lib/logger';

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// POST /api/auth/reset-password - Consumes a single-use PASSWORD_RESET token
// (issued only to the local bcrypt-authenticated seed accounts; real accounts
// reset their password through Firebase's own hosted flow instead).
export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request.headers.get('x-forwarded-for'));

    // Unauthenticated by design (the token itself is the credential), so it needs
    // the same IP rate limit forgot-password already has — the token is a
    // high-entropy random value so brute-forcing it isn't realistic in a normal
    // request budget, but this closes the inconsistency and costs nothing.
    const ipLimit = checkIpRateLimit(clientIp);
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many attempts, try again later' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;
    const tokenHash = hashToken(token);

    const tokenRecord = await prisma.secureToken.findUnique({
      where: { tokenHash },
    });

    if (!tokenRecord || tokenRecord.type !== 'PASSWORD_RESET') {
      return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 400 });
    }

    if (new Date() > tokenRecord.expiresAt) {
      await prisma.secureToken.delete({ where: { id: tokenRecord.id } });
      return NextResponse.json({ error: 'This reset link has expired.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { email: tokenRecord.email },
      data: { passwordHash },
    });

    // Single-use: delete the token, and clear any lockout state for this account.
    await prisma.secureToken.delete({ where: { id: tokenRecord.id } });
    resetFailedAttempts(tokenRecord.email);

    return NextResponse.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    logger.error('Reset-password error', { error });
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
