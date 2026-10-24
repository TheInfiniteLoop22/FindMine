// Matches GET /api/posts/[id]/claims's per-claim response shape (see the
// `baseClaim` interface in src/app/api/posts/[id]/claims/route.ts) -
// JSON-serialized, with the owner-only fields present only when the
// viewer is the post's owner (hence all optional here too).
export interface ClaimListItem {
  id: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  conversationId: string | null;
  claimant: {
    id: string;
    displayName: string;
    photoUrl: string | null;
    reputationScore: number;
    tierLabel: string;
  };
  answerText?: string | null;
  proofImageUrl?: string | null;
  itemStatus?: string | null;
  depositLocation?: string | null;
  depositLat?: number | null;
  depositLng?: number | null;
  foundAt?: string | null;
  privateDetailAnswer?: string | null;
}

// Matches GET /api/claims/mine's per-claim response shape (see
// src/app/api/claims/mine/route.ts) - a claim from the claimant's own
// point of view, with the post it targets attached.
export interface MyClaimItem {
  id: string;
  status: string;
  answerText: string | null;
  createdAt: string;
  reviewedAt: string | null;
  conversationId: string | null;
  post: {
    id: string;
    title: string;
    type: string;
    category: string;
    status: string;
    locationText: string | null;
    imageUrl: string | null;
    ownerDisplayName: string;
  };
}
