import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyFirebaseIdToken } from '@/lib/firebaseAdmin';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
// Associates a real email with an account that originally signed up via phone only
// (those accounts are seeded with a synthetic `phone_<number>@findmine.com` email).
// Re-verifies the Firebase ID token server-side rather than trusting the client.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const body = await request.json();
    const idToken = body?.idToken;
    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'Missing verification token.' }, { status: 400 });
    }

    const firebaseUser = await verifyFirebaseIdToken(idToken);

    if (!firebaseUser.email) {
      return NextResponse.json(
        { error: 'No email was found on this Firebase session.' },
        { status: 400 }
      );
    }
    if (!firebaseUser.emailVerified) {
      return NextResponse.json(
        { error: 'Please click the verification link Firebase emailed you, then try again.' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!existingUser) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    // Only allow this for accounts that don't have a real email yet (phone-only signups
    // are seeded with a synthetic `phone_<number>@findmine.com` placeholder) — this route
    // is for adding a first real email, not for swapping an existing one.
    if (!existingUser.email.startsWith('phone_') && existingUser.email !== firebaseUser.email) {
      return NextResponse.json(
        { error: 'Your account already has a registered email address.' },
        { status: 409 }
      );
    }

    const conflictingUser = await prisma.user.findFirst({
      where: { email: firebaseUser.email, NOT: { id: session.user.id } },
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
      data: { email: firebaseUser.email, emailVerified: new Date() },
      select: { email: true, emailVerified: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    logger.error('Error verifying email', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to verify email.') },
      { status: 500 }
    );
  }
}
