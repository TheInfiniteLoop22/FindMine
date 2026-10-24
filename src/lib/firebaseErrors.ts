/**
 * Maps raw Firebase Auth error messages (e.g. "Firebase: Error (auth/too-many-requests).")
 * to short, user-facing copy. Shared by sign-in, sign-up, and profile so the login flow
 * gives consistent, readable errors instead of leaking raw SDK error strings.
 */
export function mapFirebaseAuthError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const msg: string = (err instanceof Error && err.message) || '';

  if (msg.includes('auth/invalid-credential') || msg.includes('auth/user-not-found') || msg.includes('auth/wrong-password')) {
    return 'Invalid email or password.';
  }
  if (msg.includes('auth/too-many-requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (msg.includes('auth/network-request-failed')) {
    return 'Network error. Check your connection and try again.';
  }
  if (msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
    return 'Sign-in window was closed before completing. Please try again.';
  }
  if (msg.includes('auth/account-exists-with-different-credential')) {
    return 'An account already exists with this email using a different sign-in method.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'This email address is already in use.';
  }
  if (msg.includes('auth/weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (msg.includes('auth/invalid-email')) {
    return 'Invalid email address format.';
  }
  if (msg.includes('auth/invalid-phone-number')) {
    return 'Invalid phone number format. Please use international format (e.g. +11234567890).';
  }
  if (msg.includes('auth/provider-already-linked') || msg.includes('auth/credential-already-in-use')) {
    return 'This phone number is already linked to an account.';
  }
  if (msg.includes('auth/user-disabled')) {
    return 'This account has been disabled. Contact support for help.';
  }
  if (msg.includes('auth/code-expired')) {
    return 'This verification code has expired. Please request a new one.';
  }
  if (msg.includes('auth/invalid-verification-code')) {
    return 'Incorrect verification code. Please check and try again.';
  }

  return msg || fallback;
}
