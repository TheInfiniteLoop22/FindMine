import { Resend } from 'resend';
import { logger } from './logger';

// Initialize Resend Client using API Key (using placeholder or mock if none present)
const resendApiKey = process.env.RESEND_API_KEY || 're_mockKey123456';
const resend = new Resend(resendApiKey);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    // If running locally without a real API key, simulate success and print to console
    if (resendApiKey.startsWith('re_mock')) {
      console.log('--- [MOCK TRANSACTIONAL EMAIL SENT] ---');
      console.log(`To:      ${to}`);
      console.log(`Subject: ${subject}`);
      if (process.env.NODE_ENV === 'production') {
        // Never write email bodies (which can contain live password-reset
        // links/tokens) to production logs just because RESEND_API_KEY was
        // missed - fail safe-by-default instead of leaking secrets to
        // whatever platform's log stream is watching.
        console.warn(
          'Body:    [redacted - RESEND_API_KEY is not set in production; set it in your ' +
          'deployment env so this email is actually sent instead of mocked]'
        );
      } else {
        console.log(`Body:    ${html}`);
      }
      console.log('----------------------------------------');
      return { success: true, id: 'mock-email-id' };
    }

    const data = await resend.emails.send({
      from: 'FindMine Alerts <onboarding@resend.dev>',
      to,
      subject,
      html,
    });

    return { success: true, id: data.data?.id };
  } catch (error) {
    logger.error('Resend: failed to send email alert', { to, subject, error });
    // Return mock success so application flow does not crash if Resend returns domain errors
    return { success: false, error };
  }
}
