"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { auth } from "@/lib/firebase";
import {
  X,
  FileText,
  ShieldCheck,
  QrCode,
  UserCircle,
  LogOut,
  Award,
  Compass,
} from "lucide-react";

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const { data: session } = useSession();
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Prevent background scroll when open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const user = session?.user;

  const navLinks = [
    {
      href: "/profile",
      label: "Profile",
      icon: <UserCircle className="w-4 h-4" />,
      badge: null,
      accent: "text-slate-700",
      activeBg: "bg-slate-100",
    },
    {
      href: "/my-posts",
      label: "My Posts",
      icon: <FileText className="w-4 h-4" />,
      badge: null,
      accent: "text-slate-700",
      activeBg: "bg-slate-100",
    },
    {
      href: "/my-claims",
      label: "My Claims",
      icon: <ShieldCheck className="w-4 h-4" />,
      badge: null,
      accent: "text-slate-700",
      activeBg: "bg-slate-100",
    },
    {
      href: "/my-items",
      label: "Registered Items",
      icon: <QrCode className="w-4 h-4" />,
      badge: null,
      accent: "text-slate-700",
      activeBg: "bg-slate-100",
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-white shadow-2xl flex flex-col transform transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <Link href="/" onClick={onClose} className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
              <Compass className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-lg tracking-tight text-slate-900">
              Find<span className="text-indigo-600">Mine</span>
            </span>
          </Link>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User card */}
        {user && (
          <div className="mx-4 mt-4 mb-2 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
            <div className="flex items-center gap-3">
              {user.image ? (
                // Unreachable today - see the identical comment in Navbar.tsx.
                <Image
                  src={user.image}
                  alt={user.name || ""}
                  width={40}
                  height={40}
                  className="rounded-full object-cover border-2 border-white shadow-sm shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                  {user.name?.[0] || "U"}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{user.name || "User"}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Award className="w-3 h-3 text-indigo-500" />
                  <span className="text-[10px] text-indigo-600 font-semibold">Member</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all group ${
                  isActive
                    ? `${link.activeBg} ${link.accent}`
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={`${isActive ? link.accent : "text-slate-400 group-hover:text-slate-600"} transition-colors`}>
                    {link.icon}
                  </span>
                  {link.label}
                </span>
                {link.badge !== null && (
                  <span className="min-w-[20px] h-5 px-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                    {link.badge > 99 ? "99+" : link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer — Sign Out */}
        <div className="px-3 py-4 border-t border-slate-100">
          {user ? (
            <button
              type="button"
              onClick={async () => {
                onClose();
                try { await auth.signOut(); } catch {}
                signOut({ callbackUrl: "/" });
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-all"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              Sign Out
            </button>
          ) : (
            <div className="space-y-2">
              <Link
                href="/sign-in"
                onClick={onClose}
                className="block text-center w-full py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                onClick={onClose}
                className="block text-center w-full py-2.5 rounded-xl bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-700 transition-all"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};