// Matches GET /api/profile's response shape (src/app/api/profile/route.ts) -
// the signed-in user's own full profile, including private fields no other
// viewer ever sees.
export interface ReputationEventItem {
  id: string;
  type: string;
  points: number;
  createdAt: string;
}

export interface OwnProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  photoUrl: string | null;
  bio: string;
  createdAt: string;
  reputationScore: number;
  rawReputationScore: number;
  ageBonus: number;
  reputationEvents: ReputationEventItem[];
}

// Matches GET /api/users/[id]'s response shape (src/app/api/users/[id]/
// route.ts) - a public, unauthenticated profile view: only non-sensitive
// fields, plus the user's open posts and a computed reputation tier label.
export interface PublicProfile {
  id: string;
  displayName: string;
  photoUrl: string | null;
  bio: string | null;
  reputationScore: number;
  createdAt: string;
  tierLabel: string;
  openPosts: {
    id: string;
    type: string;
    title: string;
    category: string;
    locationText: string | null;
    photoUrl: string | null;
    createdAt: string;
    status: string;
  }[];
}
