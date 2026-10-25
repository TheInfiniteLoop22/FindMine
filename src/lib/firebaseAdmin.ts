import { logger } from './logger';

/**
 * Server-side Firebase ID-token verification via the `accounts:lookup` REST endpoint
 * (no Firebase Admin SDK/service account needed — this project doesn't have one configured).
 * Used by the NextAuth Credentials provider to verify the Google sign-in token.
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
