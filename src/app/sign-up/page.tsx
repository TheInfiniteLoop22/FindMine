'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Loader2, AlertCircle, CheckCircle, ShieldCheck, Lock, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { signIn } from 'next-auth/react';
import { mapFirebaseAuthError } from '@/lib/firebaseErrors';

import { getErrorMessage } from '@/lib/errors';
// Email/password sign-up is a 3-step wizard: email -> OTP verification (proves
// the inbox is real) -> password (finishes account creation). Replaces the old
// Firebase-link email verification and the phone/SMS sign-up path entirely.
type SignupStep = 'email' | 'otp' | 'password';

export default function SignUpPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [quickSignInLoading, setQuickSignInLoading] = useState<'AA' | 'BB' | null>(null);
  // Read from the server at request time rather than NEXT_PUBLIC_ENABLE_DEMO_LOGIN
  // inlined at build time — see src/app/api/config/route.ts for why.
  const [demoLoginEnabled, setDemoLoginEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setDemoLoginEnabled(!!json?.data?.demoLoginEnabled))
      .catch(() => {});
  }, []);

  const [step, setStep] = useState<SignupStep>('email');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      console.error('Google signup error:', err);
      setServerError(mapFirebaseAuthError(err, 'Google signup failed'));
    } finally {
      setGoogleLoading(false);
    }
  };

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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !email.trim() || submitting) return;
    try {
      setSubmitting(true);
      setServerError(null);
      const res = await fetch('/api/auth/signup/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), displayName: displayName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send verification code.');
      setOtpSentMessage('Verification code sent. Check your inbox.');
      setStep('otp');
    } catch (err: unknown) {
      setServerError(getErrorMessage(err, 'Failed to send verification code.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || submitting) return;
    try {
      setSubmitting(true);
      setServerError(null);
      const res = await fetch('/api/auth/signup/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: otpCode.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Invalid or expired code.');
      setTicket(json.data.ticket);
      setStep('password');
    } catch (err: unknown) {
      setServerError(getErrorMessage(err, 'Invalid or expired code.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !ticket) return;
    setServerError(null);

    if (password.length < 6) {
      setServerError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setServerError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/auth/signup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), ticket, password, displayName: displayName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create account.');

      const signInRes = await signIn('credentials', { idToken: json.data.idToken, redirect: false });
      if (signInRes?.error) {
        throw new Error(signInRes.error);
      }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      setServerError(getErrorMessage(err, 'Failed to create account.'));
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitle = {
    email: 'Create your account',
    otp: 'Verify your email',
    password: 'Choose a password',
  }[step];

  const stepSubtitle = {
    email: 'Join FindMine to post lost or found items and connect with others.',
    otp: `Enter the 6-digit code we sent to ${email}.`,
    password: 'Last step — set a password to finish creating your account.',
  }[step];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-md mx-auto px-4 py-12 w-full flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-900">{stepTitle}</h1>
            <p className="text-sm text-slate-500 mt-1">{stepSubtitle}</p>
          </div>

          {step === 'email' && demoLoginEnabled && (
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

          {serverError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {step === 'email' && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-300 font-semibold text-sm text-slate-700 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-xs mb-4 cursor-pointer disabled:opacity-50"
              >
                {googleLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>{googleLoading ? 'Signing in...' : 'Continue with Google'}</span>
              </button>

              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <span className="relative bg-white px-3 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Or with email
                </span>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">
                    Display Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Alex Rivera"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    minLength={2}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 py-2.5 px-4 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{submitting ? 'Sending code...' : 'Send Verification Code'}</span>
                </button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {otpSentMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span>{otpSentMessage}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Verification Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-mono tracking-widest"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !otpCode}
                className="w-full mt-2 py-2.5 px-4 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{submitting ? 'Verifying...' : 'Verify Code'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setStep('email'); setOtpCode(''); setOtpSentMessage(null); setServerError(null); }}
                className="w-full py-1 text-center text-xs font-semibold text-indigo-600 hover:underline flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Change Email</span>
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handleCompleteSignup} className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>Email verified.</span>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-2.5 px-4 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>{submitting ? 'Creating account...' : 'Create Account'}</span>
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-bold text-indigo-600 hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
