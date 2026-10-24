import { describe, it, expect, vi, beforeEach } from 'vitest';

const resendSend = vi.fn();
const smtpSend = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: smtpSend }) },
}));

const msg = { to: 'a@example.com', subject: 'Hi', html: '<p>x</p>' };

async function loadEmail() {
  vi.resetModules();
  return (await import('../email')).sendEmail;
}

describe('sendEmail', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resendSend.mockReset();
    smtpSend.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('reports failure when Resend RETURNS an error (sandbox rejection) instead of throwing', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_live_key');
    resendSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'You can only send testing emails to your own email address' },
    });
    const sendEmail = await loadEmail();
    const result = await sendEmail(msg);
    expect(result.success).toBe(false);
  });

  it('reports success with the provider id when Resend accepts the email', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_live_key');
    resendSend.mockResolvedValue({ data: { id: 'abc' }, error: null });
    const sendEmail = await loadEmail();
    expect(await sendEmail(msg)).toEqual({ success: true, id: 'abc' });
  });

  it('reports failure when the Resend call throws (network error)', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_live_key');
    resendSend.mockRejectedValue(new Error('network down'));
    const sendEmail = await loadEmail();
    expect((await sendEmail(msg)).success).toBe(false);
  });

  it('uses SMTP, not Resend, when SMTP_HOST is set', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_USER', 'me@example.com');
    vi.stubEnv('RESEND_API_KEY', 're_live_key');
    smtpSend.mockResolvedValue({ messageId: '<id@smtp>' });
    const sendEmail = await loadEmail();
    const result = await sendEmail(msg);
    expect(result).toEqual({ success: true, id: '<id@smtp>' });
    expect(resendSend).not.toHaveBeenCalled();
    expect(smtpSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: msg.to, from: 'FindMine <me@example.com>' })
    );
  });

  it('reports failure when SMTP delivery fails', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    smtpSend.mockRejectedValue(new Error('auth failed'));
    const sendEmail = await loadEmail();
    expect((await sendEmail(msg)).success).toBe(false);
  });

  it('falls back to a console mock (success) when no provider is configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('SMTP_HOST', '');
    const sendEmail = await loadEmail();
    expect(await sendEmail(msg)).toEqual({ success: true, id: 'mock-email-id' });
    expect(resendSend).not.toHaveBeenCalled();
  });
});
