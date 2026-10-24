import { describe, it, expect } from 'vitest';
import { getClientIp } from '../security';

describe('getClientIp', () => {
  it('prefers CF-Connecting-IP (the real client behind Cloudflare)', () => {
    expect(getClientIp('203.0.113.9, 172.70.1.1, 10.0.0.5', '198.51.100.7')).toBe('198.51.100.7');
  });

  it('ignores a spoofed X-Forwarded-For when CF-Connecting-IP is present', () => {
    expect(getClientIp('1.2.3.4, 172.70.1.1', '198.51.100.7')).toBe('198.51.100.7');
  });

  it('falls back to the LAST X-Forwarded-For entry (earlier ones are client-controlled)', () => {
    expect(getClientIp('1.2.3.4, 198.51.100.7')).toBe('198.51.100.7');
  });

  it('trims whitespace and skips empty entries', () => {
    expect(getClientIp(' 1.2.3.4 ,, 198.51.100.7 ,')).toBe('198.51.100.7');
  });

  it('treats a blank CF header as absent', () => {
    expect(getClientIp('198.51.100.7', '   ')).toBe('198.51.100.7');
  });

  it('returns loopback when there is no header at all', () => {
    expect(getClientIp(null)).toBe('127.0.0.1');
    expect(getClientIp('')).toBe('127.0.0.1');
  });
});
