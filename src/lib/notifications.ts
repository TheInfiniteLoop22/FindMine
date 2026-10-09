import { prisma } from './prisma';
import { logger } from './logger';

/**
 * Creates an in-app notification for a user. This is the real "alert the owner"
 * mechanism for QR scans/relay messages — unlike email (which silently no-ops to a
 * console log without a configured RESEND_API_KEY, see src/lib/email.ts), this
 * always actually lands, since it's just a DB row the owner's own Navbar polls for.
 * Failures are logged, not thrown — a notification failing to write should never
 * break the scan/message flow that triggered it.
 */
export async function createNotification({
  userId,
  type,
  title,
  body,
  linkUrl,
}: {
  userId: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string;
}) {
  try {
    await prisma.notification.create({
      data: { userId, type, title, body, linkUrl },
    });
  } catch (err) {
    logger.error('Notifications: failed to create notification', { userId, type, error: err });
  }
}
