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

export const FAKE_POSTS: PostItem[] = [
  {
    id: '1',
    type: 'LOST',
    status: 'OPEN',
    title: 'Black Sony WH-1000XM4 Noise Canceling Headphones',
    description: 'Left them in the main library study room 302 on the wooden desk. Has a slight scratch on the left ear cup.',
    category: 'Electronics',
    brand: 'Sony',
    color: 'Matte Black',
    locationText: 'Central Campus Library, 3rd Floor',
    lat: 37.7749,
    lng: -122.4194,
    eventDateTime: '2026-07-20T14:30:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop',
    images: [{ id: 'img-1', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop', isPrimary: true }],
    rewardNote: '₹1000 reward for safe return!',
    createdAt: '2026-07-20T16:00:00Z',
    userDisplayName: 'Alex Rivera',
  },
];
