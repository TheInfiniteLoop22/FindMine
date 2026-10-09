// Shared helper for the extremely common `catch (err: unknown)` pattern:
// TypeScript's `unknown` is correct (a catch binding is never guaranteed to
// be an Error - anything can be thrown), but almost every catch block here
// wants "the message if there is one, otherwise a fallback" rather than
// re-deriving that narrowing inline at each of the ~55 call sites.
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
