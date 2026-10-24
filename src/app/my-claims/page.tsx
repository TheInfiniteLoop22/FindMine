'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/EmptyState';
import { Loader2, AlertCircle, UserCheck, MessageSquare, Clock, CheckCircle2, XCircle, Trash2, ExternalLink } from 'lucide-react';
import type { MyClaimItem } from '@/types/claim';

import { getErrorMessage } from '@/lib/errors';
export default function MyClaimsPage() {
  const { status } = useSession();
  const router = useRouter();

  const [claims, setClaims] = useState<MyClaimItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function fetchMyClaims() {
    try {
      setLoading(true);
      const res = await fetch('/api/claims/mine');
      if (!res.ok) {
        throw new Error('Failed to fetch your claims');
      }
      const json = await res.json();
      setClaims(json.data || []);
    } catch (err: unknown) {
      console.error('Error fetching my claims:', err);
      setError(getErrorMessage(err, 'Could not load your claims'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/sign-in');
      return;
    }

    if (status === 'authenticated') {
      fetchMyClaims();
    }
  }, [status, router]);

  const handleCancelClaim = async (claimId: string) => {
    if (!confirm('Are you sure you want to cancel this claim? This will permanently delete it.')) {
      return;
    }

    try {
      setCancellingId(claimId);
      const res = await fetch(`/api/claims/${claimId}`, {
        method: 'DELETE',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to cancel claim');
      }

      setClaims((prev) => prev.filter((c) => c.id !== claimId));
    } catch (err: unknown) {
      console.error('Error cancelling claim:', err);
      alert(getErrorMessage(err, 'Could not cancel claim'));
    } finally {
      setCancellingId(null);
    }
  };

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
        <div className="mb-8 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">My Claims</h1>
          <p className="text-slate-500 text-sm mt-1">
            Track claims you have filed on lost or found items.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm font-medium">Loading claims...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-6 rounded-2xl text-center max-w-md mx-auto my-8">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
            <p className="font-semibold text-sm">{error}</p>
          </div>
        ) : claims.length > 0 ? (
          <div className="space-y-4">
            {claims.map((claim) => {
              const isApproved = claim.status === 'APPROVED';
              const isPending = claim.status === 'PENDING';
              const isRejected = claim.status === 'REJECTED';

              return (
                <div
                  key={claim.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                      <Image
                        src={claim.post.imageUrl || 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=300&auto=format&fit=crop'}
                        alt={claim.post.title}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            claim.post.type === 'LOST' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {claim.post.type}
                        </span>
                        <span className="text-xs text-slate-400">
                          Filed on {new Date(claim.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="font-bold text-base text-slate-900">
                        {claim.post.title}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Owner: <span className="font-semibold text-slate-700">{claim.post.ownerDisplayName}</span>
                      </p>
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1 max-w-lg">
                        &quot;{claim.answerText}&quot;
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end justify-between gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    <div className="flex items-center gap-2">
                      {isPending && (
                        <>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pending Review</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCancelClaim(claim.id)}
                            disabled={cancellingId === claim.id}
                            className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors border border-transparent hover:border-rose-100"
                            title="Cancel Claim"
                          >
                            {cancellingId === claim.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </>
                      )}

                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approved</span>
                        </span>
                      )}

                      {isRejected && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rejected</span>
                        </span>
                      )}
                    </div>

                    {isApproved && claim.conversationId && (
                      <Link
                        href={`/dms/${claim.conversationId}`}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Open Chat</span>
                      </Link>
                    )}

                    <Link
                      href={`/posts/${claim.post.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 mt-1"
                    >
                      <span>View Post</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Section 4.8 EmptyState component */
          <EmptyState
            icon={UserCheck}
            title="You haven't claimed any items yet"
            description="When you spot an item in the feed that belongs to you or you found for someone else, file a claim to connect."
            actionLabel="Browse Recent Items"
            actionHref="/"
          />
        )}
      </main>
    </div>
  );
}
