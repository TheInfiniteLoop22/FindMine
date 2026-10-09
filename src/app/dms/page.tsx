"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import Image from "next/image";
import { Loader2, MessageSquare, PlusCircle } from "lucide-react";
import Link from "next/link";
import type { ConversationSummary } from '@/types/conversation';

import { getErrorMessage } from '@/lib/errors';
function formatDistance(date: Date): string {
  const diffMs = new Date().getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

export default function DmsPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/sign-in");
  }, [authStatus, router]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    async function fetchConversations() {
      try {
        setLoading(true);
        const res = await fetch("/api/conversations/mine");
        if (!res.ok) throw new Error("Failed to load conversations");
        const json = await res.json();
        setConversations(json.data || []);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Could not load conversations"));
      } finally {
        setLoading(false);
      }
    }
    fetchConversations();
  }, [authStatus]);

  if (authStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-indigo-600" />
            Messages
          </h1>
          <p className="text-xs text-slate-500 mt-1">Your direct conversations — opened after a claim is approved</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs">
            {error}
          </div>
        )}

        {conversations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm space-y-4">
            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto">
              <MessageSquare className="w-10 h-10 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">No conversations yet</h3>
              <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                Conversations open automatically when a claim on a post is approved by the poster.
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              Browse Posts
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
            {conversations.map((convo) => {
              const otherUser = convo.otherUser;
              const lastMsg = convo.lastMessage;
              const unread = convo.unreadCount ?? 0;
              const isUnread = unread > 0;

              return (
                <Link
                  key={convo.id}
                  href={`/dms/${convo.id}`}
                  className={`flex items-center gap-4 p-4 sm:p-5 hover:bg-slate-50/70 transition-colors ${isUnread ? "bg-indigo-50/30" : ""}`}
                >
                  {/* Avatar with online dot */}
                  <div className="relative shrink-0">
                    {otherUser.photoUrl ? (
                      <Image
                        src={otherUser.photoUrl}
                        alt={otherUser.displayName}
                        width={48}
                        height={48}
                        className="rounded-full object-cover border-2 border-white shadow-sm"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center font-black text-base shadow-sm">
                        {otherUser.displayName?.[0] || "U"}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={`font-bold text-sm truncate ${isUnread ? "text-slate-950" : "text-slate-800"}`}>
                        {otherUser.displayName}
                      </h3>
                      {lastMsg && (
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {formatDistance(new Date(lastMsg.createdAt))}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 truncate ${isUnread ? "text-slate-800 font-semibold" : "text-slate-500"}`}>
                      {lastMsg
                        ? lastMsg.isSystem
                          ? `📌 ${lastMsg.body}`
                          : lastMsg.body
                        : "No messages yet — say hi!"}
                    </p>
                  </div>

                  {/* Unread badge */}
                  {isUnread && (
                    <div className="shrink-0">
                      <span className="min-w-[20px] h-5 px-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}