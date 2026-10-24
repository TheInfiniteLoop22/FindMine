'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import Image from 'next/image';
import { CATEGORIES } from '@/data/posts';
import { QRCodeDownloadButton } from '@/components/QRCodeDownloadButton';
import { Loader2, AlertCircle, Upload, CheckCircle2, ArrowRight, Mail, MessageSquare, ShieldCheck } from 'lucide-react';

import { getErrorMessage } from '@/lib/errors';
interface SelectedImage {
  file: File;
  previewUrl: string;
}

// The subset of POST /api/registered-items's created-row response this
// success screen actually renders (see src/app/api/registered-items/route.ts).
interface CreatedRegisteredItem {
  nickname: string;
  publicToken: string;
  contactMode: 'SHOW_EMAIL' | 'SHOW_PHONE' | 'RELAY_ONLY';
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB, matches the server-side limit in /api/upload

export default function NewRegisteredItemPage() {
  const { status } = useSession();
  const router = useRouter();

  // Form Fields State
  const [nickname, setNickname] = useState('');
  const [category, setCategory] = useState('');
  const [contactMode, setContactMode] = useState<'SHOW_EMAIL' | 'RELAY_ONLY'>('RELAY_ONLY');

  // Contact info shown to strangers who scan the QR code can't be freely typed —
  // it must be the user's own account email, so it comes from their profile
  // rather than a free-text input. (Phone contact mode was removed entirely —
  // this app no longer has any phone verification mechanism.)
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountEmailVerified, setAccountEmailVerified] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Add-a-first-verified-email flow — only ever shown when the account has no
  // verified email yet (every normal sign-up path already ends with one, so
  // this covers a rare edge case rather than the common case).
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'enter-email' | 'enter-code'>('enter-email');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);

  // Image Upload State
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Errors / Success States
  const [error, setError] = useState<string | null>(null);
  const [registeredItem, setRegisteredItem] = useState<CreatedRegisteredItem | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/sign-in');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data;
        if (!data) return;
        setAccountEmail(data.email || null);
        setAccountEmailVerified(!!data.emailVerified);
      })
      .catch((err) => console.error('Failed to load profile for contact info:', err))
      .finally(() => setProfileLoaded(true));
  }, [status]);

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);
    setOtpSentMessage(null);
    try {
      setOtpSending(true);
      const res = await fetch('/api/profile/email/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send verification code.');
      setOtpSentMessage(`Code sent to ${otpEmail}.`);
      setOtpStep('enter-code');
    } catch (err: unknown) {
      setOtpError(getErrorMessage(err, 'Failed to send verification code.'));
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);
    try {
      setOtpVerifying(true);
      const res = await fetch('/api/profile/email/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail, code: otpCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Invalid or expired code.');
      setAccountEmail(json.data.email);
      setAccountEmailVerified(!!json.data.emailVerified);
    } catch (err: unknown) {
      setOtpError(getErrorMessage(err, 'Invalid or expired code.'));
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('Image is too large. Maximum size is 8MB.');
      return;
    }
    setSelectedImage({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  };

  const removeImage = () => {
    setSelectedImage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('Item Nickname is required.');
      return;
    }
    if (contactMode === 'SHOW_EMAIL' && !(accountEmail && accountEmailVerified)) {
      setError('Please verify an email address for this contact mode first.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      let finalPhotoUrl = '';

      // Upload photo first if selected
      if (selectedImage) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', selectedImage.file);

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadJson.error || 'Failed to upload photo.');
        }

        finalPhotoUrl = uploadJson.data?.url || uploadJson.url || '';
        setUploading(false);
      }

      // Create pre-registration item
      const res = await fetch('/api/registered-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          category: category || undefined,
          photoUrl: finalPhotoUrl || undefined,
          contactMode,
          email: contactMode === 'SHOW_EMAIL' ? accountEmail : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to register item.');
      }

      setRegisteredItem(json.data);
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, 'Error occurred while registering your item.'));
      setUploading(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Success view rendering QR code download component directly
  if (registeredItem) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        <Navbar />
        <main className="max-w-md mx-auto my-auto p-6 text-center space-y-6 bg-white border border-slate-200 rounded-3xl shadow-xl">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-black text-slate-900">Registration Successful!</h2>
          <p className="text-xs text-slate-500">
            Your item <span className="font-bold text-slate-800">&quot;{registeredItem.nickname}&quot;</span> has been pre-registered.
          </p>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left text-xs space-y-2">
            <div>
              <span className="text-slate-400 font-bold">Public Token:</span>
              <p className="font-mono text-slate-700 bg-white p-2 rounded-lg border border-slate-200/60 mt-1 truncate">
                {registeredItem.publicToken}
              </p>
            </div>
            <div>
              <span className="text-slate-400 font-bold">Contact Mode:</span>
              <p className="font-semibold text-slate-800 mt-0.5">{registeredItem.contactMode}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <QRCodeDownloadButton
              publicToken={registeredItem.publicToken}
              nickname={registeredItem.nickname}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-1.5"
              buttonText="Download Printable Label (QR)"
            />
            
            <button
              type="button"
              onClick={() => router.push('/my-items')}
              className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm transition-all inline-flex items-center justify-center gap-1.5"
            >
              <span>Go to My Items</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-xl mx-auto px-4 py-10 w-full flex-1">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900">Register a Belonging</h1>
          <p className="text-xs text-slate-400 mt-1">
            Pre-register an item to print a QR sticker before it gets lost.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          
          {/* Nickname */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
              Item Nickname *
            </label>
            <input
              type="text"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. My Black Backpack, Office Keys"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
              Category (Optional)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Select a category</option>
              {CATEGORIES.filter((c) => c !== 'All Categories').map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
              Item Photo (Optional)
            </label>
            {selectedImage ? (
              <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                {/* unoptimized: this is a local blob: object URL (a client-side
                    file preview, never uploaded yet) - next/image's built-in
                    optimizer can't fetch blob: URLs server-side. */}
                <Image src={selectedImage.previewUrl} alt="Preview" fill sizes="128px" unoptimized className="object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-1.5 right-1.5 bg-slate-900/80 hover:bg-slate-950 text-white rounded-full p-1"
                >
                  &times;
                </button>
              </div>
            ) : (
              <label className="w-full h-24 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors text-slate-400 hover:text-slate-600 bg-slate-50/30">
                <Upload className="w-5 h-5 mb-1.5" />
                <span className="text-[11px] font-bold">Upload Photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            )}
          </div>

          {/* Contact Mode Selectors */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-400 uppercase">
              Contact Mode Options
            </label>

            <div className="grid grid-cols-1 gap-3">
              <label className={`border rounded-2xl p-4 flex items-start gap-3 cursor-pointer transition-all ${
                contactMode === 'RELAY_ONLY' ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-200'
              }`}>
                <input
                  type="radio"
                  name="contactMode"
                  value="RELAY_ONLY"
                  checked={contactMode === 'RELAY_ONLY'}
                  onChange={() => setContactMode('RELAY_ONLY')}
                  className="accent-indigo-600 mt-1"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Relay Only (Recommended)</span>
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Finders send one-way messages through FindMine. Your raw email/phone are never exposed.
                  </p>
                </div>
              </label>

              <label className={`border rounded-2xl p-4 flex items-start gap-3 cursor-pointer transition-all ${
                contactMode === 'SHOW_EMAIL' ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-200'
              }`}>
                <input
                  type="radio"
                  name="contactMode"
                  value="SHOW_EMAIL"
                  checked={contactMode === 'SHOW_EMAIL'}
                  onChange={() => setContactMode('SHOW_EMAIL')}
                  className="accent-indigo-600 mt-1"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Reveal Email Address</span>
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Show your designated email address directly on the public scan landing screen.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* This is locked to the user's own verified account email rather than
              free text, since this is exactly what a stranger who scans the QR
              code will see and contact. Most accounts already have one (every
              current sign-up path — email/password OTP, Google, or a seed
              account — ends with a verified email), so this is a simple
              confirmation. The rare account without one gets an inline
              add-and-verify flow instead of a dead-looking blocked field. */}
          {contactMode === 'SHOW_EMAIL' && profileLoaded && (
            <div className="animate-in fade-in slide-in-from-top-2">
              {accountEmail && accountEmailVerified ? (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                      Verified contact email
                    </p>
                    <p className="text-sm font-semibold text-slate-800">{accountEmail}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      This is what finders will see on the public scan screen.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                  <p className="text-xs font-semibold text-amber-900">
                    Your account doesn&apos;t have a verified email yet — add and verify one to use
                    this contact mode.
                  </p>

                  {otpError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{otpError}</span>
                    </div>
                  )}

                  {otpStep === 'enter-email' ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="email"
                        required
                        value={otpEmail}
                        onChange={(e) => setOtpEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleSendEmailOtp}
                        disabled={otpSending || !otpEmail.trim()}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                      >
                        {otpSending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Send Code</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {otpSentMessage && <p className="text-[11px] text-emerald-700 font-medium">{otpSentMessage}</p>}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="6-digit code"
                          className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyEmailOtp}
                          disabled={otpVerifying || otpCode.length !== 6}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                        >
                          {otpVerifying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>Verify Code</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpStep('enter-email');
                          setOtpCode('');
                          setOtpError(null);
                        }}
                        className="text-[11px] font-semibold text-amber-700 hover:underline"
                      >
                        Use a different email
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push('/my-items')}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading || (contactMode === 'SHOW_EMAIL' && !(accountEmail && accountEmailVerified))}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {(submitting || uploading) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Register Item</span>
            </button>
          </div>

        </form>
      </main>
    </div>
  );
}
