import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { checkIpRateLimit, checkAccountLockout, recordFailedAttempt, resetFailedAttempts, getClientIp } from '@/lib/security';
import { verifyFirebaseIdToken } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET must be set — refusing to start with no session secret.');
}

// A fixed bcrypt hash with no real matching password, used to equalize
// timing on the "no such seed account" path below (see authorizeCredentials)
// - without this, that path skips bcrypt.compare entirely and returns much
// faster than the "account exists, wrong password" path, letting an
// attacker enumerate valid emails purely from response time. Computed once
// per process (bcrypt.hash itself takes real time) rather than per request.
let dummyPasswordHashPromise: Promise<string> | null = null;
function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = bcrypt.hash('timing-safety-dummy-password-never-matches', 10);
  }
  return dummyPasswordHashPromise;
}

// Exported standalone (rather than left as an inline arrow in
// CredentialsProvider's config) so it's directly unit/integration-testable
// without reaching into next-auth's internal provider object shape - see
// src/lib/__tests__/auth.integration.test.ts. Same function NextAuth's HTTP
// layer calls; no behavior change.
export async function authorizeCredentials(
  credentials: Partial<Record<'email' | 'password' | 'idToken' | 'displayName', string>> | undefined,
  req: Pick<import('next-auth').RequestInternal, 'headers' | 'body' | 'query' | 'method'>
) {
  const xForwardedFor = (req?.headers as Record<string, string> | undefined)?.['x-forwarded-for'];
  const clientIp = getClientIp(xForwardedFor);

  const ipLimit = checkIpRateLimit(clientIp);
  if (!ipLimit.success) {
    throw new Error('Too many sign-in attempts. Please try again in a minute.');
  }

  // 1. Seed Account Login Bypass — gated behind an explicit env flag so a
  // fresh deployment (or a fork of this repo) doesn't inherit a live
  // unauthenticated login path to seed accounts by default. This app's own
  // deployment sets ENABLE_DEMO_LOGIN=true intentionally, since the seed
  // accounts are non-sensitive demo data and their credentials are already
  // published in the README for reviewers.
  if (credentials?.email && credentials?.password && process.env.ENABLE_DEMO_LOGIN === 'true') {
    const lockout = await checkAccountLockout(credentials.email);
    if (lockout.blocked) {
      throw new Error('Too many failed attempts. This account is temporarily locked — try again later.');
    }

    const user = await prisma.user.findFirst({
      where: {
        email: credentials.email,
        isSeedAccount: true,
      },
    });

    // Always run a real bcrypt compare, whether or not a matching account
    // was found - comparing against a fixed dummy hash when it wasn't,
    // instead of skipping the (comparatively slow) hash compare on that
    // path entirely. Keeps the "no such account" and "wrong password"
    // paths taking comparable time either way.
    const hashToCompare = user?.passwordHash ?? (await getDummyPasswordHash());
    const isValid = await bcrypt.compare(credentials.password, hashToCompare);

    if (user && user.passwordHash && isValid) {
      resetFailedAttempts(credentials.email);
      return {
        id: user.id,
        email: user.email,
        name: user.displayName,
      };
    }

    await recordFailedAttempt(credentials.email);
    throw new Error('Invalid email or password');
  }

  // 2. Firebase ID Token Login Verification
  const idToken = credentials?.idToken;
  if (!idToken) {
    throw new Error('Authentication token required');
  }

  try {
    const firebaseUser = await verifyFirebaseIdToken(idToken);

    const email = firebaseUser.email;
    const phone = firebaseUser.phoneNumber;
    const emailVerified = firebaseUser.emailVerified;

    if (!email && !phone) {
      throw new Error('Invalid user details received from Firebase');
    }

    const displayName = credentials?.displayName || firebaseUser.displayName || email?.split('@')[0] || phone || 'User';
    const localEmail = email || `phone_${phone}@findmine.com`;

    let user = await prisma.user.findUnique({
      where: { email: localEmail },
    });

    // Server-side enforcement (not just client-side) that an email account is
    // actually verified before it can sign in — applies uniformly to every path
    // that reaches here (Google, email/password), not just whichever tab the
    // frontend happens to gate.
    //
    // This checks OUR OWN DB record first, not only Firebase's mirrored
    // `emailVerified` flag: email/password sign-up now proves ownership via a
    // custom email-OTP flow (`/api/auth/signup/*`, see emailOtp.ts) instead of
    // Firebase's native verification link, and pre-creates the Prisma `User` row
    // with `emailVerified` already set at that point — Firebase's own copy of the
    // flag stays false forever for those accounts since Firebase was never asked
    // to verify anything. Google accounts don't need this fallback (Firebase's
    // flag is already true, verified by Google itself); the DB fallback only
    // ever trusts a value this server previously set itself, never anything the
    // client supplies directly, so it can't be used to fake verification.
    if (email && !emailVerified && !user?.emailVerified) {
      throw new Error('Please verify your email before signing in.');
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: localEmail,
          displayName,
          emailVerified: emailVerified ? new Date() : null,
        },
      });
    } else {
      const dataToUpdate: Prisma.UserUpdateInput = {};
      if (emailVerified && !user.emailVerified) {
        dataToUpdate.emailVerified = new Date();
      }
      if (Object.keys(dataToUpdate).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: dataToUpdate,
        });
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.displayName,
    };
  } catch (err: unknown) {
    logger.error('Firebase Auth verification error', { error: err });
    throw new Error(getErrorMessage(err, 'Authentication failed'));
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        idToken: { label: 'ID Token', type: 'text' },
        displayName: { label: 'Display Name', type: 'text' },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/sign-in',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
