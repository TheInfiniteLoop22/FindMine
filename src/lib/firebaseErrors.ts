/**
 * Maps raw Firebase Auth error messages (e.g. "Firebase: Error (auth/too-many-requests).")
 * to short, user-facing copy. Used by the Google sign-in flow so it
 * gives consistent, readable errors instead of leaking raw SDK error strings.
 */
export function mapFirebaseAuthError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const msg: string = (err instanceof Error && err.message) || '';

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
  if (msg.includes('auth/popup-blocked')) {
    return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  }
  if (msg.includes('auth/unauthorized-domain')) {
    return 'Google sign-in is not enabled for this website address yet. Please contact the site owner.';
  }
  if (msg.includes('auth/user-disabled')) {
    return 'This account has been disabled. Contact support for help.';
  }

  return msg || fallback;
}
