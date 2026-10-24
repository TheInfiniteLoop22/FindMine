'use client';

import React, { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Navbar } from '@/components/Navbar';
import { ClaimModal } from '@/components/ClaimModal';
import { EditPostModal } from '@/components/EditPostModal';
import { PostImageItem } from '@/data/posts';
import type { PostDetail, PostMatch } from '@/types/post';
import type { ClaimListItem, MyClaimItem } from '@/types/claim';

import { getErrorMessage } from '@/lib/errors';
const DynamicMapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-44 w-full bg-slate-100 animate-pulse rounded-xl" />
  ),
});
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Loader2,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  CheckSquare,
  MessageSquare,
  Clock,
  XCircle,
  ImageIcon,
  MapPinIcon,
} from 'lucide-react';

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string>('');
  
  // Claim state tracking
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [userClaimStatus, setUserClaimStatus] = useState<string | null>(null);
  const [userClaimConversationId, setUserClaimConversationId] = useState<string | null>(null);
  const [claimSuccessMessage, setClaimSuccessMessage] = useState<string | null>(null);

  // Claims Log state
  // (only the setter is used - a loading spinner keyed off the value itself
  // was never wired up in the render below)
  const [, setClaimsLoading] = useState(false);
  const [claims, setClaims] = useState<ClaimListItem[]>([]);
  const [isClaimsOwner, setIsClaimsOwner] = useState(false);
  const [postPrivateDetail, setPostPrivateDetail] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Suggested matches states
  const [matches, setMatches] = useState<PostMatch[]>([]);
  const [embeddingStatus, setEmbeddingStatus] = useState<string>('pending');
  const [isMatchesExpanded, setIsMatchesExpanded] = useState<boolean>(true);

  // Edit and Delete controls
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolving, setResolving] = useState(false);

  const isOwner = session?.user?.id && post?.userId === session.user.id;

  useEffect(() => {
    async function fetchPostAndClaim() {
      try {
        setLoading(true);
        const res = await fetch(`/api/posts/${id}`);
        if (!res.ok) {
          throw new Error('Post not found');
        }
        const json = await res.json();
        const p = json.data;

        const images: PostImageItem[] = p.images || [];
        const primary = images.find((i) => i.isPrimary)?.url || images[0]?.url || p.photoUrl;

        setPost(p);
        setSelectedImage(primary);

        if (session?.user?.id && p.userId !== session.user.id) {
          const claimsRes = await fetch('/api/claims/mine');
          if (claimsRes.ok) {
            const claimsJson = await claimsRes.json();
            const matchingClaim = (claimsJson.data as MyClaimItem[] | undefined)?.find((c) => c.post?.id === id);
            if (matchingClaim) {
              setUserClaimStatus(matchingClaim.status);
              setUserClaimConversationId(matchingClaim.conversationId);
            }
          }
        }
      } catch (err: unknown) {
        console.error('Error loading post:', err);
        setError(getErrorMessage(err, 'Failed to load post'));
      } finally {
        setLoading(false);
      }
    }

    fetchPostAndClaim();
  }, [id, session?.user?.id]);

  // Fetch claims for this post (Claims Log)
  useEffect(() => {
    if (!id) return;

    async function fetchClaims() {
      try {
        setClaimsLoading(true);
        const res = await fetch(`/api/posts/${id}/claims`);
        if (res.ok) {
          const json = await res.json();
          setClaims(json.data || []);
          setIsClaimsOwner(json.isOwner || false);
          setPostPrivateDetail(json.privateDetail || null);
        }
      } catch (err) {
        console.error('Error fetching claims:', err);
      } finally {
        setClaimsLoading(false);
      }
    }

    fetchClaims();
  }, [id, claimSuccessMessage]);

  // Fetch matches computed for this post
  useEffect(() => {
    if (!id) return;

    async function fetchMatches() {
      try {
        const res = await fetch(`/api/posts/${id}/matches`);
        if (res.ok) {
          const json = await res.json();
          setMatches(json.data?.matches || []);
          setEmbeddingStatus(json.data?.embeddingStatus || 'done');
        }
      } catch (err) {
        console.error('Error fetching matches on post detail:', err);
      }
    }

    fetchMatches();
  }, [id]);

  const handleDeletePost = async () => {
    if (!confirm('Are you sure you want to permanently delete this post? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(true);
      const res = await fetch(`/api/posts/${id}`, {
        method: 'DELETE',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete post');
      }

      router.push('/my-posts');
      router.refresh();
    } catch (err: unknown) {
      console.error('Error deleting post:', err);
      alert(getErrorMessage(err, 'Could not delete post.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleResolvePost = async () => {
    if (!confirm('Are you sure you want to resolve/close this item? It will be marked CLOSED.')) {
      return;
    }

    try {
      setResolving(true);
      const res = await fetch(`/api/posts/${id}/close`, {
        method: 'POST',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to resolve post');
      }

      setPost(json.data);
      alert('Post resolved! +10 Reputation points awarded.');
    } catch (err: unknown) {
      console.error('Error resolving post:', err);
      alert(getErrorMessage(err, 'Could not resolve post.'));
    } finally {
      setResolving(false);
    }
  };

  const handleApproveClaim = async (claimId: string) => {
    if (!confirm('Approve this claim? This will mark the post as MATCHED and reject all other pending claims.')) {
      return;
    }

    try {
      setActionLoading(claimId);
      const res = await fetch(`/api/claims/${claimId}/approve`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to approve claim');

      // Refresh claims and post
      const [claimsRes, postRes] = await Promise.all([
        fetch(`/api/posts/${id}/claims`),
        fetch(`/api/posts/${id}`),
      ]);
      if (claimsRes.ok) {
        const claimsJson = await claimsRes.json();
        setClaims(claimsJson.data || []);
      }
      if (postRes.ok) {
        const postJson = await postRes.json();
        setPost(postJson.data);
      }
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Could not approve claim.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectClaim = async (claimId: string) => {
    if (!confirm('Reject this claim?')) return;

    try {
      setActionLoading(claimId);
      const res = await fetch(`/api/claims/${claimId}/reject`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to reject claim');

      // Refresh claims
      const claimsRes = await fetch(`/api/posts/${id}/claims`);
      if (claimsRes.ok) {
        const claimsJson = await claimsRes.json();
        setClaims(claimsJson.data || []);
      }
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Could not reject claim.'));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="max-w-md mx-auto my-auto p-6 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900">Post Not Found</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">The item post does not exist or was removed.</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm"
          >
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  const isLost = post.type === 'LOST';
  const isPostClosedOrMatched = post.status === 'MATCHED' || post.status === 'CLOSED';

  // Filters matches above 0.3 threshold
  const validMatches = matches.filter((m) => m.score >= 0.3);

  // Claims categorization for rendering
  const approvedClaims = claims.filter((c) => c.status === 'APPROVED');
  const pendingClaims = claims.filter((c) => c.status === 'PENDING');
  const rejectedClaims = claims.filter((c) => c.status === 'REJECTED');
  const visibleClaims = [...approvedClaims, ...pendingClaims];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {claimSuccessMessage && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{claimSuccessMessage}</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: Post Header (unchanged) */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2">
          {/* Gallery Column */}
          <div className="p-6 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col justify-between">
            <div className="relative h-80 sm:h-96 w-full rounded-xl overflow-hidden bg-white border border-slate-200">
              <Image
                src={selectedImage}
                alt={post.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute top-3 left-3 flex gap-2">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${
                    isLost ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
                  }`}
                >
                  {post.type}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-900/75 text-white backdrop-blur-xs">
                  {post.category}
                </span>
              </div>
            </div>

            {post.images && post.images.length > 1 && (
              <div className="flex gap-3 mt-4 overflow-x-auto pb-1">
                {post.images.map((img: PostImageItem) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setSelectedImage(img.url)}
                    className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                      selectedImage === img.url
                        ? 'border-indigo-600 ring-2 ring-indigo-200'
                        : 'border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Image src={img.url} alt="Thumbnail" fill sizes="80px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details Column */}
          <div className="p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                      post.status === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {post.status}
                  </span>

                  {isOwner && (
                    <div className="flex items-center gap-2">
                      {!isPostClosedOrMatched && (
                        <button
                          type="button"
                          onClick={() => setIsEditModalOpen(true)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-950 hover:bg-slate-100 transition-all border border-slate-200 bg-white"
                          title="Edit Post Details"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDeletePost}
                        disabled={deleting}
                        className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-all border border-rose-200 bg-white"
                        title="Delete Post"
                      >
                        {deleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                      {!isPostClosedOrMatched && (
                        <button
                          type="button"
                          onClick={handleResolvePost}
                          disabled={resolving}
                          className="p-1.5 rounded-lg text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 transition-all border border-emerald-200 bg-white"
                          title="Resolve/Close Item (+10 Rep)"
                        >
                          {resolving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckSquare className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <h1 className="text-2xl font-black text-slate-900 leading-tight">
                  {post.title}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Posted by{' '}
                  <Link href={`/users/${post.userId}`} className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors">
                    {post.user?.displayName || 'Community Member'}
                  </Link>
                </p>
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <h3 className="font-bold text-slate-900 text-sm">Description</h3>
                <p className="leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {post.description}
                </p>
              </div>

              <div className="space-y-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{post.locationText || 'Location specified'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Posted on {new Date(post.createdAt).toLocaleDateString()}</span>
                </div>
                {post.eventDateTime && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      {isLost ? 'Lost' : 'Found'} on {new Date(post.eventDateTime).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {!isLost && post.itemStatus && (
                <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200/80 space-y-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">Current Status of Item</h3>
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold">
                      {post.itemStatus === 'WITH_ME' ? 'Poster has it with them' : 'Deposited somewhere'}
                    </span>
                  </div>
                  {post.depositLocationText && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <MapPinIcon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{post.depositLocationText}</span>
                    </div>
                  )}
                  {typeof post.depositLat === 'number' && typeof post.depositLng === 'number' && (
                    <div className="pt-1">
                      <DynamicMapView
                        center={[post.depositLat, post.depositLng]}
                        selectedPos={[post.depositLat, post.depositLng]}
                        zoom={15}
                        height="160px"
                      />
                    </div>
                  )}
                </div>
              )}

              {typeof post.lat === 'number' && typeof post.lng === 'number' && (
                <div className="pt-1">
                  <DynamicMapView
                    posts={[
                      {
                        id: post.id,
                        type: post.type,
                        status: 'OPEN',
                        title: post.title,
                        description: post.description || '',
                        category: post.category,
                        locationText: post.locationText || 'Location specified',
                        lat: post.lat,
                        lng: post.lng,
                        eventDateTime: post.createdAt,
                        imageUrl: selectedImage,
                        images: post.images,
                        createdAt: post.createdAt,
                        userDisplayName: post.user?.displayName || 'Community Member',
                      },
                    ]}
                    center={[post.lat, post.lng]}
                    zoom={15}
                    height="220px"
                  />
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* SECTION 2: Claim Action Button (unchanged conditional rules) */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              {authStatus === 'unauthenticated' ? (
                <button
                  type="button"
                  onClick={() => router.push('/sign-in')}
                  className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-colors"
                >
                  Sign In to Claim This Item
                </button>
              ) : isOwner ? (
                <div className="space-y-2">
                  <div className="p-3.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold text-center border border-slate-200">
                    You are the owner of this post.
                  </div>
                  {/* Show chat button to owner if post is matched (approved claim exists) */}
                  {post.status === 'MATCHED' && (
                    <Link
                      href="/dms"
                      className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Open Messages</span>
                    </Link>
                  )}
                </div>
              ) : userClaimStatus === 'APPROVED' && userClaimConversationId ? (
                // Claimant with approved claim — always show chat regardless of post status
                <Link
                  href={`/dms/${userClaimConversationId}`}
                  className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors inline-flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Open Chat</span>
                </Link>
              ) : isPostClosedOrMatched ? (
                <button
                  disabled
                  className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-slate-200 text-slate-400 cursor-not-allowed"
                >
                  This Item is {post.status}
                </button>
              ) : userClaimStatus ? (
                <div className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Claim Status: {userClaimStatus}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsClaimModalOpen(true)}
                  className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
                >
                  Claim This Item
                </button>
              )}
            </div>

          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: Claims Log */}
        {/* ═══════════════════════════════════════════════════════════════ */}



        {claims.length > 0 && (
          <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                Claims Log ({claims.length})
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isClaimsOwner
                  ? 'Review claims on your post. Approve or reject pending submissions.'
                  : 'Activity on this post.'}
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Approved + Pending Claims */}
              {visibleClaims.map((claim) => (
                <ClaimRow
                  key={claim.id}
                  claim={claim}
                  isOwner={isClaimsOwner}
                  postPrivateDetail={postPrivateDetail}
                  postType={post.type}
                  actionLoading={actionLoading}
                  onApprove={handleApproveClaim}
                  onReject={handleRejectClaim}
                />
              ))}

              {/* Rejected Claims — collapsed by default */}
              {rejectedClaims.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowRejected(!showRejected)}
                    className="w-full px-6 py-3 flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" />
                      {showRejected ? 'Hide' : 'Show'} Rejected Claims ({rejectedClaims.length})
                    </span>
                    {showRejected ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {showRejected &&
                    rejectedClaims.map((claim) => (
                      <ClaimRow
                        key={claim.id}
                        claim={claim}
                        isOwner={isClaimsOwner}
                        postPrivateDetail={postPrivateDetail}
                        postType={post.type}
                        actionLoading={actionLoading}
                        onApprove={handleApproveClaim}
                        onReject={handleRejectClaim}
                      />
                    ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 4: AI Suggested Matches — owner-only, bottom of page  */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {isOwner && embeddingStatus === 'done' && validMatches.length > 0 && (
          <div className="mt-8 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setIsMatchesExpanded(!isMatchesExpanded)}
              className="w-full px-6 py-4 flex items-center justify-between font-bold text-slate-900 text-sm bg-slate-50/70 border-b border-slate-100/80"
            >
              <span className="flex items-center gap-2 text-indigo-600">
                <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                <span>AI-Suggested Matches ({validMatches.length})</span>
              </span>
              {isMatchesExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {isMatchesExpanded && (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {validMatches.slice(0, 3).map((match) => {
                  const p = match.matchedPost;
                  const isStrong = match.score >= 0.7;

                  return (
                    <div
                      key={match.id}
                      className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-3 bg-slate-50/30 hover:border-indigo-300 transition-all group cursor-pointer"
                      onClick={() => router.push(`/posts/${p.id}`)}
                    >
                      <div className="flex gap-3">
                        <Image
                          src={p.photoUrl || 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=300&auto=format&fit=crop'}
                          alt={p.title}
                          width={56}
                          height={56}
                          className="rounded-xl object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mb-1 ${
                              isStrong ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isStrong ? 'Strong Match' : 'Possible Match'}
                          </span>
                          <h4 className="font-bold text-slate-900 text-xs truncate group-hover:text-indigo-600 transition-colors">
                            {p.title}
                          </h4>
                          <p className="text-slate-500 text-[10px] line-clamp-1">
                            {p.description}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400">
                        <span className="truncate max-w-[120px]">{p.locationText}</span>
                        <span className="font-bold text-indigo-600 hover:text-indigo-700 shrink-0">
                          Details →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      <ClaimModal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
        postId={post.id}
        postTitle={post.title}
        postType={post.type}
        hasPrivateDetail={!!post.privateDetail || !!post.hasPrivateDetail}
        onClaimSubmitted={() => {
          setClaimSuccessMessage("Claim submitted successfully!");
          setUserClaimStatus('PENDING');
        }}
      />

      <EditPostModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        post={post}
        onPostUpdated={(updatedPost) => setPost(updatedPost)}
      />
    </div>
  );
}

// ─── Claim Row Component ─────────────────────────────────────────
function ClaimRow({
  claim,
  isOwner,
  postPrivateDetail,
  postType,
  actionLoading,
  onApprove,
  onReject,
}: {
  claim: ClaimListItem;
  isOwner: boolean;
  postPrivateDetail: string | null;
  postType: string;
  actionLoading: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    APPROVED: {
      label: 'Verified',
      color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    PENDING: {
      label: 'Pending',
      color: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: <Clock className="w-3 h-3" />,
    },
    REJECTED: {
      label: 'Rejected',
      color: 'bg-rose-100 text-rose-700 border-rose-200',
      icon: <XCircle className="w-3 h-3" />,
    },
  };

  const sc = statusConfig[claim.status] || statusConfig.PENDING;
  const claimant = claim.claimant;
  const tierColors: Record<string, string> = {
    'Trusted Member': 'bg-emerald-100 text-emerald-700',
    'Active Member': 'bg-indigo-100 text-indigo-700',
    'New Member': 'bg-slate-100 text-slate-600',
  };

  return (
    <div className={`px-6 py-4 ${claim.status === 'REJECTED' ? 'opacity-60' : ''}`}>
      {/* Claimant identity row — visible to everyone */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {claimant.photoUrl ? (
            <Image
              src={claimant.photoUrl}
              alt={claimant.displayName}
              width={36}
              height={36}
              className="rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-extrabold text-xs shrink-0">
              {claimant.displayName?.[0] || 'U'}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900 truncate">{claimant.displayName}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tierColors[claimant.tierLabel] || tierColors['New Member']}`}>
                {claimant.tierLabel}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Claimed {new Date(claim.createdAt).toLocaleDateString()} at {new Date(claim.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${sc.color}`}>
            {sc.icon}
            {sc.label}
          </span>
        </div>
      </div>

      {/* Owner-only: structured answer content */}
      {isOwner && (
        <div className="mt-3 ml-12 space-y-2">
          {/* Finder-type claim (claiming a LOST post) */}
          {postType === 'LOST' && (
            <>
              {claim.proofImageUrl && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <a href={claim.proofImageUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate">
                    Photo Proof
                  </a>
                </div>
              )}
              {claim.foundAt && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Found on: {new Date(claim.foundAt).toLocaleDateString()}</span>
                </div>
              )}
              {claim.itemStatus && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <MapPinIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    {claim.itemStatus === 'WITH_ME' ? 'Has item with them' : 'Deposited'}
                    {claim.depositLocation && ` at: ${claim.depositLocation}`}
                  </span>
                </div>
              )}
              {typeof claim.depositLat === 'number' && typeof claim.depositLng === 'number' && (
                <div className="mt-1 max-w-xs">
                  <DynamicMapView
                    posts={[
                      {
                        id: claim.id,
                        type: 'FOUND',
                        status: 'OPEN',
                        title: claim.itemStatus === 'WITH_ME' ? 'Collection Point' : 'Deposit Location',
                        description: '',
                        category: '',
                        locationText: claim.depositLocation || 'Pinned location',
                        lat: claim.depositLat,
                        lng: claim.depositLng,
                        eventDateTime: claim.createdAt,
                        imageUrl: 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=300&auto=format&fit=crop',
                        createdAt: claim.createdAt,
                        userDisplayName: claimant.displayName,
                      },
                    ]}
                    center={[claim.depositLat, claim.depositLng]}
                    zoom={15}
                    height="160px"
                  />
                </div>
              )}
            </>
          )}

          {/* Private-detail side-by-side comparison — applies to claims on both FOUND and LOST posts */}
          {claim.privateDetailAnswer && postPrivateDetail && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Private Detail Verification</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-0.5">Your Detail</p>
                  <p className="text-slate-900 bg-white p-2 rounded-lg border border-amber-100">{postPrivateDetail}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-0.5">Their Answer</p>
                  <p className="text-slate-900 bg-white p-2 rounded-lg border border-amber-100">{claim.privateDetailAnswer}</p>
                </div>
              </div>
            </div>
          )}

          {/* Free-text answer */}
          {claim.answerText && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-slate-500 mb-1">Additional Details</p>
              <p className="text-xs text-slate-700 leading-relaxed">{claim.answerText}</p>
            </div>
          )}

          {/* Approve / Reject Buttons — only on PENDING claims */}
          {claim.status === 'PENDING' && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onApprove(claim.id)}
                disabled={actionLoading === claim.id}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
              >
                {actionLoading === claim.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Approve
              </button>
              <button
                type="button"
                onClick={() => onReject(claim.id)}
                disabled={actionLoading === claim.id}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-700 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
