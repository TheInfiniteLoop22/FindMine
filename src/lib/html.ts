/**
 * Escapes text for interpolation into an HTML email body. Relay messages, display
 * names and item nicknames are user-controlled; without this a finder could inject
 * markup (fake buttons, links) into the email the owner receives.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
