export type PostType = 'LOST' | 'FOUND';
export type PostStatus = 'OPEN' | 'MATCHED' | 'CLOSED';

export interface PostImageItem {
  id: string;
  url: string;
  isPrimary: boolean;
}

export interface PostItem {
  id: string;
  type: PostType;
  status: PostStatus;
  title: string;
  description: string;
  category: string;
  brand?: string;
  color?: string;
  locationText: string;
  lat?: number | null;
  lng?: number | null;
  distance_km?: number | null;
  eventDateTime: string;
  imageUrl: string;
  images?: PostImageItem[];
  rewardNote?: string;
  createdAt: string;
  userDisplayName: string;
}

export const CATEGORIES = [
  'All Categories',
  'Electronics',
  'ID & Documents',
  'Bags & Backpacks',
  'Keys',
  'Wallet',
  'Clothing & Accessories',
  'Stationery & Books',
  'Chargers, Cables & Power Banks',
  'Earphones & Headphones',
  'USB / Pen Drive',
  'Water Bottle',
  'Umbrella',
  'Spectacles',
  'Calculator',
  'Sports Equipment',
  'Pets',
  'Bicycles & Vehicles',
  'Jewelry & Watches',
  'Other',
] as const;
