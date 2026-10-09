// Matches the shape GET /api/posts/[id] returns for its "safePost" object
// (see src/app/api/posts/[id]/route.ts) - JSON-serialized (dates as ISO
// strings), with privateDetail/contactPhone only present for the owner.
// Shared by the post detail page and its edit modal. Reuses PostType/
// PostStatus/PostImageItem from data/posts.ts rather than redefining them,
// since PostCard.tsx's PostItem already establishes those as the frontend's
// canonical enums.
import type { PostType, PostStatus, PostImageItem } from '@/data/posts';

export type PostImage = PostImageItem;

export interface PostDetail {
  id: string;
  type: PostType;
  status: PostStatus;
  title: string;
  description: string;
  category: string;
  photoUrl: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  eventDateTime: string | null;
  itemStatus: string | null;
  depositLocationText: string | null;
  depositLat: number | null;
  depositLng: number | null;
  createdAt: string;
  userId: string;
  user: { id: string; displayName: string };
  images: PostImage[];
  hasPrivateDetail: boolean;
  privateDetail?: string | null;
  contactPhone?: string | null;
}

// Matches GET /api/posts/[id]/matches's per-match response shape (see
// src/app/api/posts/[id]/matches/route.ts's formattedMatches).
export interface PostMatch {
  id: string;
  score: number;
  distanceKm: number | null;
  matchedPost: {
    id: string;
    type: PostType;
    status: PostStatus;
    title: string;
    description: string;
    category: string;
    photoUrl: string | null;
    locationText: string | null;
    lat: number | null;
    lng: number | null;
    createdAt: string;
    images: PostImageItem[];
  };
}

// Matches GET /api/posts/mine's response shape (src/app/api/posts/mine/
// route.ts) - note this route's Prisma query has no `images` include at
// all, so `images` is always undefined here despite the field existing on
// the Post model; typed as optional/absent rather than "fixed" to include
// it, since that would be a behavior change beyond a typing cleanup.
export interface MyPostItem {
  id: string;
  type: PostType;
  status: PostStatus;
  title: string;
  description: string;
  photoUrl: string | null;
  createdAt: string;
  images?: PostImageItem[];
}

// Matches GET /api/posts's list-item shape (src/app/api/posts/route.ts) -
// used by the homepage feed and "my posts" list.
export interface PostSummary {
  id: string;
  type: PostType;
  status: PostStatus;
  title: string;
  description: string;
  category: string;
  photoUrl: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  userId: string;
  distance_km: number | null;
  user: { displayName: string };
  images: PostImage[];
  hasPrivateDetail: boolean;
  userDisplayName?: string;
}
