'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/EmptyState';
import { Loader2, AlertCircle, FileQuestion, PlusCircle, ExternalLink } from 'lucide-react';
import type { MyPostItem } from '@/types/post';
import type { PostImageItem } from '@/data/posts';

import { getErrorMessage } from '@/lib/errors';
export default function MyPostsPage() {
  const { status } = useSession();
  const router = useRouter();

  const [posts, setPosts] = useState<MyPostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/sign-in');
      return;
    }

    if (status === 'authenticated') {
      async function fetchMyPosts() {
        try {
          setLoading(true);
          const res = await fetch('/api/posts/mine');
          if (!res.ok) {
            throw new Error('Failed to fetch your posts');
          }
          const json = await res.json();
          setPosts(json.data || []);
        } catch (err: unknown) {
          console.error('Error fetching my posts:', err);
          setError(getErrorMessage(err, 'Could not load your posts'));
        } finally {
          setLoading(false);
        }
      }

      fetchMyPosts();
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Posted Items</h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage items you have reported as Lost or Found.
            </p>
          </div>
          <Link
            href="/posts/new"
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Post New Item</span>
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm font-medium">Loading your posts...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-6 rounded-2xl text-center max-w-md mx-auto my-8">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
            <p className="font-semibold text-sm">{error}</p>
          </div>
        ) : posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map((post) => {
              const primaryImage =
                post.images?.find((img: PostImageItem) => img.isPrimary)?.url ||
                post.images?.[0]?.url ||
                post.photoUrl ||
                'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=300&auto=format&fit=crop';

              return (
                <div
                  key={post.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                      <Image
                        src={primaryImage}
                        alt={post.title}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                      <span
                        className={`absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase text-white ${
                          post.type === 'LOST' ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                      >
                        {post.type}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            post.status === 'OPEN'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {post.status}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="font-bold text-base text-slate-900 line-clamp-1">
                        {post.title}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {post.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <Link
                      href={`/posts/${post.id}`}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1"
                    >
                      <span>View</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* EmptyState component per Section 4.7 */
          <EmptyState
            icon={FileQuestion}
            title="You haven't posted any items yet"
            description="If you lost something or found an item in public, report it here so the community can reach out."
            actionLabel="Post an Item Now"
            actionHref="/posts/new"
          />
        )}
      </main>
    </div>
  );
}
