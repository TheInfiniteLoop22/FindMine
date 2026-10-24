"use client";

import React, { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/Navbar";
import { Loader2, AlertCircle, Award, Calendar, MapPin, UserCircle, ArrowLeft } from "lucide-react";
import type { PublicProfile } from '@/types/profile';

import { getErrorMessage } from '@/lib/errors';
export default function PublicUserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = use(params);
  const { data: session } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        setLoading(true);
        const res = await fetch(`/api/users/${userId}`);
        if (!res.ok) {
          throw new Error("User not found");
        }
        const json = await res.json();
        setProfile(json.data);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Could not load profile"));
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="max-w-md mx-auto my-auto p-6 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900">Profile Not Found</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">This user profile does not exist or was removed.</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const tierColors: Record<string, { bg: string; text: string; ring: string }> = {
    "Trusted Member": { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-300" },
    "Active Member": { bg: "bg-indigo-100", text: "text-indigo-800", ring: "ring-indigo-300" },
    "New Member": { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-300" },
  };
  const tier = tierColors[profile.tierLabel] ?? tierColors["New Member"];

  const isOwnProfile = session?.user?.id === userId;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 w-full flex-1 space-y-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Profile Card */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          {/* Banner */}
          <div className="h-24 bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600" />

          <div className="px-8 pb-8 -mt-12">
            {/* Avatar */}
            <div className="flex items-end justify-between">
              <div className="relative">
                {profile.photoUrl ? (
                  <Image
                    src={profile.photoUrl}
                    alt={profile.displayName}
                    width={96}
                    height={96}
                    className="rounded-2xl object-cover border-4 border-white shadow-md"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-indigo-100 border-4 border-white shadow-md flex items-center justify-center">
                    <UserCircle className="w-12 h-12 text-indigo-400" />
                  </div>
                )}
              </div>
              {isOwnProfile && (
                <Link
                  href="/profile"
                  className="mb-2 px-4 py-1.5 text-xs font-bold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all"
                >
                  Edit Profile
                </Link>
              )}
            </div>

            <div className="mt-4 space-y-1">
              <h1 className="text-2xl font-black text-slate-900">{profile.displayName}</h1>

              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${tier.bg} ${tier.text}`}>
                <Award className="w-3.5 h-3.5" />
                {profile.tierLabel}
              </span>
            </div>

            {profile.bio && (
              <p className="mt-4 text-sm text-slate-600 leading-relaxed max-w-lg">{profile.bio}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Member since {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-slate-400" />
                <span>{profile.reputationScore ?? 0} reputation points</span>
              </div>
            </div>
          </div>
        </div>

        {/* Open Posts */}
        {profile.openPosts?.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-sm font-black text-slate-900">
                Active Posts ({profile.openPosts.length})
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Open lost &amp; found posts by this member</p>
            </div>
            <div className="divide-y divide-slate-100">
              {profile.openPosts.map((p) => (
                <Link
                  key={p.id}
                  href={`/posts/${p.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors group"
                >
                  <div
                    className={`relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border ${
                      p.photoUrl ? "" : "bg-slate-100 flex items-center justify-center"
                    }`}
                  >
                    {p.photoUrl ? (
                      <Image src={p.photoUrl} alt={p.title} fill sizes="40px" className="object-cover" />
                    ) : (
                      <MapPin className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          p.type === "LOST" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {p.type}
                      </span>
                      <span className="text-[10px] text-slate-400">{p.category}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                      {p.title}
                    </h3>
                    {p.locationText && (
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{p.locationText}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {profile.openPosts?.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <p className="text-sm font-medium">No active posts from this member.</p>
          </div>
        )}
      </main>
    </div>
  );
}