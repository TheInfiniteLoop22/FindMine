// Matches the exact shape GET /api/registered-items/mine returns (see
// src/app/api/registered-items/mine/route.ts's parsedItems.map(...)) - a
// deliberately narrower, JSON-serialized view of the RegisteredItem Prisma
// model (dates as ISO strings, plus computed scanCount/lastScannedAt), not
// the raw DB row. Shared by the page and the edit modal so both stay in
// sync with what the API actually sends instead of each guessing via `any`.
// Matches GET /api/qr/[token]'s public scan-lookup response shape (see the
// `secureResponse` object in src/app/api/qr/[token]/route.ts) - phone/email
// are only present at all when contactMode matches, never leaked otherwise.
export interface QrScanResult {
  nickname: string;
  category: string | null;
  photoUrl: string | null;
  status: string;
  lostAt: string | null;
  contactMode: 'SHOW_EMAIL' | 'SHOW_PHONE' | 'RELAY_ONLY';
  ownerName: string;
  email?: string;
}

export interface RegisteredItemSummary {
  id: string;
  nickname: string;
  category: string | null;
  photoUrl: string | null;
  contactMode: 'SHOW_EMAIL' | 'SHOW_PHONE' | 'RELAY_ONLY';
  status: string;
  publicToken: string;
  createdAt: string;
  lostAt: string | null;
  scanCount: number;
  lastScannedAt: string | null;
}
