'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Navbar } from '@/components/Navbar';
import { Loader2, AlertCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { mapFirebaseAuthError } from '@/lib/firebaseErrors';

import { getErrorMessage } from '@/lib/errors';

function SignInForm() {
  const router = useRouter();

  const [serverError, setServerError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Read from the server at request time rather than NEXT_PUBLIC_ENABLE_DEMO_LOGIN
  // inlined at build time — see src/app/api/config/route.ts for why.
  const [demoLoginEnabled, setDemoLoginEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setDemoLoginEnabled(!!json?.data?.demoLoginEnabled))
      .catch(() => {});
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setServerError(null);
      setGoogleLoading(true);

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const idToken = await user.getIdToken();
      const signInRes = await signIn('credentials', {
        idToken,
        displayName: user.displayName || undefined,
        redirect: false,
      });

      if (signInRes?.error) {
        throw new Error(signInRes.error);
      }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      console.error('Google sign in error:', err);
      setServerError(mapFirebaseAuthError(err, 'Google sign in failed'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const [quickSignInLoading, setQuickSignInLoading] = useState<'AA' | 'BB' | null>(null);

  // Testing-phase convenience: instantly sign in as one of the two seeded demo
  // accounts (bcrypt-hashed, isSeedAccount: true) without touching Firebase at all.
  const handleQuickSignIn = async (which: 'AA' | 'BB') => {
    try {
      setServerError(null);
      setQuickSignInLoading(which);
      const creds = which === 'AA' ? { email: 'a@gmail.com', password: 'aaaaaa' } : { email: 'b@gmail.com', password: 'bbbbbb' };
      const signInRes = await signIn('credentials', { ...creds, redirect: false });
      if (signInRes?.error) {
        throw new Error(signInRes.error);
      }
      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      setServerError(getErrorMessage(err, 'Quick sign-in failed.'));
    } finally {
      setQuickSignInLoading(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="text-sm text-slate-500 mt-1">
          Sign in to manage your posts and respond to claims.
        </p>
      </div>

      {/* Quick Sign-In (testing/demo accounts) — only rendered when this
          deployment opts in via NEXT_PUBLIC_ENABLE_DEMO_LOGIN, so a fresh
          deployment/fork doesn't inherit a live seed-account login path by
          default. Mirrors the server-side ENABLE_DEMO_LOGIN gate in auth.ts. */}
      {demoLoginEnabled && (
        <div className="mb-6 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-2">Quick Sign-In (Testing)</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickSignIn('AA')}
              disabled={quickSignInLoading !== null}
              className="py-2 rounded-lg text-xs font-bold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {quickSignInLoading === 'AA' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Sign In as AA</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSignIn('BB')}
              disabled={quickSignInLoading !== null}
              className="py-2 rounded-lg text-xs font-bold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {quickSignInLoading === 'BB' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Sign In as BB</span>
            </button>
          </div>
        </div>
      )}

      {/* Google Sign In Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="w-full py-2.5 px-4 rounded-xl border border-slate-300 font-semibold text-sm text-slate-700 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
      >
        {googleLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>{googleLoading ? 'Signing in...' : 'Continue with Google'}</span>
      </button>

      {serverError && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans relative overflow-hidden">
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-glow-orb" aria-hidden="true" />
      <div className="absolute top-1/3 -right-24 w-80 h-80 bg-glow-orb opacity-70" aria-hidden="true" />

      <Navbar />

      <main className="relative max-w-md mx-auto px-4 py-12 w-full flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-2 duration-300">
        <Suspense fallback={
          <div className="flex justify-center items-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        }>
          <SignInForm />
        </Suspense>
      </main>
    </div>
  );
}
