"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Loader2, Bell, QrCode } from "lucide-react";
import Link from "next/link";

import { getErrorMessage } from '@/lib/errors';
interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  read: boolean;
  createdAt: string;
}

function formatDistance(date: Date): string {
  const diffMs = new Date().getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationsPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/sign-in");
  }, [authStatus, router]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    async function fetchNotifications() {
      try {
        setLoading(true);
        const res = await fetch("/api/notifications");
        if (!res.ok) throw new Error("Failed to load notifications");
        const json = await res.json();
        setNotifications(json.data || []);

        // Mark everything read now that the user is looking at the list.
        fetch("/api/notifications/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => {});
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Could not load notifications"));
      } finally {
        setLoading(false);
      }
    }
    fetchNotifications();
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
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-indigo-600" />
            Notifications
          </h1>
          <p className="text-xs text-slate-500 mt-1">Scans and messages on your registered items, and other alerts</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs">
            {error}
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm space-y-4">
            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto">
              <Bell className="w-10 h-10 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">No notifications yet</h3>
              <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                You&apos;ll see an alert here the moment someone scans one of your registered items&apos; QR codes.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
            {notifications.map((n) => {
              const content = (
                <div
                  className={`flex items-start gap-4 p-4 sm:p-5 hover:bg-slate-50/70 transition-colors ${
                    !n.read ? "bg-indigo-50/30" : ""
                  }`}
                >
                  <div className="shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={`font-bold text-sm truncate ${!n.read ? "text-slate-950" : "text-slate-800"}`}>
                        {n.title}
                      </h3>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {formatDistance(new Date(n.createdAt))}
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 ${!n.read ? "text-slate-800 font-semibold" : "text-slate-500"}`}>
                      {n.body}
                    </p>
                  </div>
                </div>
              );

              return n.linkUrl ? (
                <Link key={n.id} href={n.linkUrl}>
                  {content}
                </Link>
              ) : (
                <div key={n.id}>{content}</div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
