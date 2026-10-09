"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Compass, PlusCircle, MessageSquare, Menu, Bell } from "lucide-react";
import { SideDrawer } from "@/components/SideDrawer";

export const Navbar: React.FC = () => {
  const { data: session, status } = useSession();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const isAuthenticated = status === "authenticated" && session?.user;

  // Poll unread message count every 10 seconds
  const fetchUnread = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch("/api/conversations/unread-count");
      if (res.ok) {
        const json = await res.json();
        setUnreadCount(json.count ?? 0);
      }
    } catch {}
  }, [isAuthenticated]);

  // Poll unread notification count (QR scans/relay messages, etc.) every 10 seconds
  const fetchUnreadNotifs = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const json = await res.json();
        setUnreadNotifCount(json.count ?? 0);
      }
    } catch {}
  }, [isAuthenticated]);

  useEffect(() => {
    fetchUnread();
    fetchUnreadNotifs();
    const interval = setInterval(() => {
      fetchUnread();
      fetchUnreadNotifs();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchUnread, fetchUnreadNotifs]);

  return (
    <>
      <nav className="bg-white/95 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-3">

            {/* Hamburger — always left */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 mr-auto">
              <div className="bg-indigo-600 p-1.5 rounded-xl text-white">
                <Compass className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-xl tracking-tight text-slate-900">
                Find<span className="text-indigo-600">Mine</span>
              </span>
            </Link>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  {/* Notifications bell with badge — QR scans, relay messages, etc. */}
                  <Link
                    href="/notifications"
                    className="relative p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                    aria-label="Notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadNotifCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                        {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                      </span>
                    )}
                  </Link>

                  {/* DM Icon with badge */}
                  <Link
                    href="/dms"
                    className="relative p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                    aria-label="Messages"
                  >
                    <MessageSquare className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>

                  {/* Post Item button */}
                  <Link
                    href="/posts/new"
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 rounded-xl transition-all shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Post Item</span>
                    <span className="sm:hidden">Post</span>
                  </Link>

                  {/* Avatar -> opens nav drawer (Profile now lives at the top of the drawer) */}
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    className="flex items-center p-0.5 rounded-full border-2 border-transparent hover:border-indigo-300 transition-all"
                    aria-label="Open navigation menu"
                  >
                    {session.user.image ? (
                      // Unreachable today: authorizeCredentials() (src/lib/auth.ts) never
                      // sets `image` on the NextAuth user, so this is always null/undefined
                      // in practice. Kept for forward-compatibility; if that ever changes,
                      // the new image host will also need adding to next.config.ts's
                      // images.remotePatterns.
                      <Image
                        src={session.user.image}
                        alt={session.user.name || ""}
                        width={32}
                        height={32}
                        className="rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs">
                        {session.user.name?.[0] || session.user.email?.[0] || "U"}
                      </div>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/posts/new"
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 rounded-xl transition-all shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Post Item</span>
                    <span className="sm:hidden">Post</span>
                  </Link>
                  <Link
                    href="/sign-in"
                    className="text-sm font-semibold text-slate-700 hover:text-slate-900 px-3 py-2"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/sign-up"
                    className="text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-900 px-3.5 py-2 rounded-xl transition-all"
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Slide-out Drawer */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </>
  );
};