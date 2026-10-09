'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { PostItem } from '@/data/posts';
import { Calendar, MapPin, Navigation, User } from 'lucide-react';

interface PostCardProps {
  post: PostItem;
}

export const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const router = useRouter();
  const isLost = post.type === 'LOST';

  // Safely grab the primary image URL
  const imgUrl =
    post.images?.find((img) => img.isPrimary)?.url ||
    post.images?.[0]?.url ||
    post.imageUrl;

  const handleCardClick = () => {
    router.push(`/posts/${post.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-indigo-200 transition-all duration-300 flex flex-col justify-between group cursor-pointer"
    >
      {/* Photo Container */}
      <div className="relative h-48 bg-slate-100 overflow-hidden shrink-0">
        <Image
          src={imgUrl || 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=600&auto=format&fit=crop'}
          alt={post.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover group-hover:scale-103 transition-transform duration-300"
        />

        {/* Badge Overlays */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm text-white ${
              isLost ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
          >
            {post.type}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-slate-900/60 text-white backdrop-blur-xs">
            {post.category}
          </span>
        </div>

        {/* PostStatus Badge Overlay */}
        {post.status && post.status !== 'OPEN' && (
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-white uppercase shadow-sm">
              {post.status}
            </span>
          </div>
        )}
      </div>

      {/* Card Info Content */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <h3 className="font-bold text-base text-slate-950 line-clamp-1 group-hover:text-indigo-600 transition-colors">
            {post.title}
          </h3>
          <p className="text-slate-500 text-xs line-clamp-2 leading-relaxed">
            {post.description}
          </p>
          {post.userDisplayName && (
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <User className="w-3 h-3 shrink-0" />
              <span className="truncate">Posted by {post.userDisplayName}</span>
            </div>
          )}
        </div>

        {/* Location & Time Footer info */}
        <div className="pt-3 border-t border-slate-100/80 space-y-1.5 text-[11px] text-slate-500">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{post.locationText}</span>
            </div>

            {/* PostGIS computed distance rendering */}
            {post.distance_km != null && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 shrink-0">
                <Navigation className="w-2.5 h-2.5" />
                <span>{post.distance_km.toFixed(1)} km away</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{new Date(post.createdAt || post.eventDateTime).toLocaleDateString()}</span>
            </div>
            <span className="font-bold text-indigo-600 group-hover:text-indigo-700 transition-colors">
              Details →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
