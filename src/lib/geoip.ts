import { logger } from './logger';

/**
 * Best-effort, privacy-safe "rough area" lookup for a scan IP — city/region level
 * only, via a free, no-API-key IP geolocation API (ipapi.co). Never stores or
 * returns the raw IP itself, only a human-readable rough-area string, matching the
 * privacy stance the old (fully fake) implementation already claimed to have.
 */
export async function getRoughAreaFromIp(ip: string): Promise<string> {
  if (!ip || isPrivateOrLocalIp(ip)) {
    return 'Unknown Location';
  }

  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return 'Unknown Location';

    const data = await res.json();
    if (data.error) return 'Unknown Location';

    const city = data.city as string | undefined;
    const region = data.region as string | undefined;
    const country = data.country_name as string | undefined;

    const parts = [city, region || country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
  } catch (err) {
    // Deliberately not logging `ip` here, consistent with this file's own
    // privacy stance above (never store/log the raw IP).
    logger.warn('GeoIP: rough-area lookup failed', { error: err });
    return 'Unknown Location';
  }
}

function isPrivateOrLocalIp(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}
