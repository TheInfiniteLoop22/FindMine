'use client';

import { useCallback, useEffect, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

interface UseCurrentLocationResult {
  coords: Coords | null;
  loading: boolean;
  /** True once a geolocation attempt has finished without producing coords (denied, timed out, or unsupported). */
  denied: boolean;
  /** Re-runs the browser geolocation prompt (e.g. for a "Retry" button after a denial). */
  retry: () => void;
}

/**
 * Single shared source of "where is the user right now" for every map on the site,
 * so every map centers on the same real geolocation attempt instead of each screen
 * rolling its own (previously: three different hardcoded fallback coordinates across
 * the homepage, post-creation, and the shared MapView component).
 *
 * Deliberately has no hardcoded city/country fallback coordinate — on denial/timeout
 * it just reports `denied: true` and leaves `coords: null`, so callers can decide
 * what to show (e.g. MapView's own single last-resort default, or a manual-pin prompt)
 * rather than silently centering on a location the user never actually granted.
 */
export function useCurrentLocation(options?: { immediate?: boolean }): UseCurrentLocationResult {
  const immediate = options?.immediate ?? true;
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const retry = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setDenied(true);
      return;
    }

    setLoading(true);
    setDenied(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLoading(false);
      },
      () => {
        setDenied(true);
        setLoading(false);
      },
      { timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (immediate) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { coords, loading, denied, retry };
}
