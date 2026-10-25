import { Resend } from 'resend';
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from './logger';

/**
 * Transactional email with two interchangeable providers:
 *
 * - SMTP (nodemailer) when SMTP_HOST is set. Works with any mailbox provider
 *   (Gmail app password, Brevo, SES, ...) and delivers to arbitrary recipients
 *   without owning a sending domain.
 * - Resend otherwise. Its shared sandbox sender (onboarding@resend.dev) only
 *   delivers to the Resend account owner until a domain is verified; set
 *   EMAIL_FROM to an address on a verified domain to lift that.
 *
 * With neither configured (local dev) the email is logged to the console.
 *
 * Failure contract: this never throws. It returns `{ success: false, error }`
 * for EVERY failure, including the ones the Resend SDK reports by *returning*
 * `{ error }` instead of throwing - callers decide whether that is loud (sign-up
 * OTP -> 502) or quiet (QR relay alert, which has an in-app notification).
 */
const DEFAULT_FROM = 'FindMine <onboarding@resend.dev>';

const resendApiKey = process.env.RESEND_API_KEY || 're_mockKey123456';
const resend = new Resend(resendApiKey);

let smtpTransport: Transporter | null = null;
function getSmtpTransport(): Transporter {
  if (!smtpTransport) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      // Fail fast when the host blocks outbound SMTP (e.g. Render's free tier
      // blocks 25/465/587) instead of hanging for nodemailer's 2-minute default.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return smtpTransport;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const from =
    process.env.EMAIL_FROM ||
    (process.env.SMTP_USER ? `FindMine <${process.env.SMTP_USER}>` : DEFAULT_FROM);

  try {
    if (process.env.SMTP_HOST) {
      const info = await getSmtpTransport().sendMail({ from, to, subject, html });
      return { success: true, id: info.messageId };
    }

    // If running locally without a real API key, simulate success and print to console
    if (resendApiKey.startsWith('re_mock')) {
      console.log('--- [MOCK TRANSACTIONAL EMAIL SENT] ---');
      console.log(`To:      ${to}`);
      console.log(`Subject: ${subject}`);
      if (process.env.NODE_ENV === 'production') {
        // Never write email bodies (which can contain live password-reset
        // links/tokens) to production logs just because a provider was
        // missed - fail safe-by-default instead of leaking secrets to
        // whatever platform's log stream is watching.
        console.warn(
          'Body:    [redacted - no email provider is configured in production; set SMTP_HOST or ' +
          'RESEND_API_KEY so this email is actually sent instead of mocked]'
        );
      } else {
        console.log(`Body:    ${html}`);
      }
      console.log('----------------------------------------');
      return { success: true, id: 'mock-email-id' };
    }

    const { data, error } = await resend.emails.send({ from, to, subject, html });

    // The Resend SDK reports API rejections (sandbox recipient restriction,
    // invalid address, bad key) by returning `error`, not by throwing.
    if (error) {
      logger.error('Resend: email rejected', { to, subject, error });
      return { success: false, error };
    }

    return { success: true, id: data?.id };
  } catch (error) {
    logger.error('Email: failed to send', { to, subject, error });
    return { success: false, error };
  }
}
