import { logger } from './logger';

/**
 * Server-side Firebase ID-token verification via the `accounts:lookup` REST endpoint
 * (no Firebase Admin SDK/service account needed — this project doesn't have one configured).
 * Shared between the NextAuth Credentials provider and the profile contact-verification
 * routes so there's exactly one place that talks to this endpoint.
 */
export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  displayName: string | null;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Firebase API key is not configured');
  }

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!verifyRes.ok) {
    const errJson = await verifyRes.json().catch(() => ({}));
    logger.error('Firebase token verification failed', { response: errJson });
    throw new Error('Invalid authentication session');
  }

  const verifyData = await verifyRes.json();
  const firebaseUser = verifyData.users?.[0];

  if (!firebaseUser) {
    throw new Error('User account not found in Firebase');
  }

  return {
    uid: firebaseUser.localId,
    email: firebaseUser.email || null,
    emailVerified: !!firebaseUser.emailVerified,
    phoneNumber: firebaseUser.phoneNumber || null,
    displayName: firebaseUser.displayName || null,
  };
}

/**
 * Creates a Firebase Auth email/password user server-side via the public Identity
 * Toolkit `accounts:signUp` REST endpoint (same no-Admin-SDK approach as the rest of
 * this file). Used by the sign-up OTP flow (`/api/auth/signup/complete`) instead of
 * the client SDK's `createUserWithEmailAndPassword`, since account creation now
 * happens only after our own email-OTP has already proven ownership — there's no
 * reason to also make the client drive Firebase's own (link-based) verification.
 *
 * Note: the Firebase account this creates still has `emailVerified: false` on
 * Firebase's side — this app does not rely on that flag for OTP-verified accounts;
 * see the `authorizeCredentials` comment in `src/lib/auth.ts` for why that's safe.
 */
export async function createFirebaseEmailPasswordUser(
  email: string,
  password: string
): Promise<{ idToken: string; localId: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Firebase API key is not configured');
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    const code = data?.error?.message || 'UNKNOWN_ERROR';
    if (code.startsWith('EMAIL_EXISTS')) {
      throw new Error('An account with this email already exists.');
    }
    if (code.startsWith('WEAK_PASSWORD')) {
      throw new Error('Password is too weak. Please use at least 6 characters.');
    }
    logger.error('Firebase accounts:signUp failed', { email, code });
    throw new Error('Failed to create account.');
  }

  return { idToken: data.idToken, localId: data.localId };
}

/**
 * Deletes a Firebase Auth user via the `accounts:delete` REST endpoint, using that
 * account's own idToken (self-delete — no Admin SDK/service account needed, same as
 * the rest of this file). Used to roll back the Firebase account created by
 * `createFirebaseEmailPasswordUser` if the follow-up Prisma `User.create` fails, so a
 * DB failure can't leave a Firebase account with no matching app row — an orphaned
 * account like that is stuck forever (can't sign up again: EMAIL_EXISTS; can't sign in
 * either, since it was never Firebase-verified). Errors are swallowed and logged rather
 * than thrown, since this already runs from inside a catch block — the original error
 * is what should surface to the caller.
 */
export async function deleteFirebaseUser(idToken: string): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      logger.error('Rollback: failed to delete orphaned Firebase account', { response: errJson });
    }
  } catch (err) {
    logger.error('Rollback: error deleting orphaned Firebase account', { error: err });
  }
}

/**
 * Triggers Firebase's own hosted password-reset email for a Firebase-managed account
 * (i.e. everyone except the local bcrypt-only seed accounts). Uses the same public
 * Identity Toolkit REST API the client SDK's `sendPasswordResetEmail` calls under the
 * hood, so no service account/Admin SDK credentials are required.
 * Returns false (without throwing) if no Firebase account exists for this email, so
 * callers can stay enumeration-safe.
 */
export async function sendFirebasePasswordResetEmail(email: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
      }
    );
    return res.ok;
  } catch (err) {
    logger.error('Firebase password reset email dispatch failed', { email, error: err });
    return false;
  }
}
