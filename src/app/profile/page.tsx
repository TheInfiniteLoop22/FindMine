'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import Image from 'next/image';
import { ImageUploadField } from '@/components/ImageUploadField';
import { Loader2, AlertCircle, Award, CheckCircle2, User, Mail, FileText, ShieldCheck, Trash2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { EmailAuthProvider, linkWithCredential, sendEmailVerification } from 'firebase/auth';
import { mapFirebaseAuthError } from '@/lib/firebaseErrors';
import type { OwnProfile } from '@/types/profile';

import { getErrorMessage } from '@/lib/errors';
export default function ProfilePage() {
  const { status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Edit fields
  const [displayName, setDisplayName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [bio, setBio] = useState('');
  
  // Banner dismissible state
  const [showNudge, setShowNudge] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Contact & Verification panel state
  const [addingEmail, setAddingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newEmailPassword, setNewEmailPassword] = useState('');
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactLoading, setContactLoading] = useState(false);

  // Delete-account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/sign-in');
      return;
    }

    if (status === 'authenticated') {
      fetchProfile();
    }
  }, [status, router]);

  async function fetchProfile() {
    try {
      setLoading(true);
      const res = await fetch('/api/profile');
      if (!res.ok) {
        throw new Error('Failed to fetch profile');
      }
      const json = await res.json();
      setProfile(json.data);
      setDisplayName(json.data.displayName || '');
      setPhotoUrl(json.data.photoUrl || '');
      setBio(json.data.bio || '');

      // Trigger profile nudge banner if both photoUrl and bio are missing
      const dismissNudge = localStorage.getItem(`dismiss_nudge_${json.data.id}`);
      if (!json.data.photoUrl && !json.data.bio && !dismissNudge) {
        setShowNudge(true);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, 'Could not load profile'));
    } finally {
      setLoading(false);
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSuccessMsg(null);
      setError(null);

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          photoUrl: photoUrl || null,
          bio: bio || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update profile');
      }

      setSuccessMsg('Profile updated successfully!');
      if (photoUrl || bio) {
        setShowNudge(false);
      }
      fetchProfile();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not save changes'));
    } finally {
      setSaving(false);
    }
  };

  const dismissNudgeBanner = () => {
    if (profile?.id) {
      localStorage.setItem(`dismiss_nudge_${profile.id}`, 'true');
    }
    setShowNudge(false);
  };

  // Link a real email + password to the current Firebase account (for accounts that
  // signed up via phone only), then send Firebase's own verification email.
  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    if (!auth.currentUser) {
      setContactError('Your Firebase session has expired - please sign out and sign in again.');
      return;
    }
    try {
      setContactLoading(true);
      const credential = EmailAuthProvider.credential(newEmail.trim(), newEmailPassword);
      await linkWithCredential(auth.currentUser, credential);
      await sendEmailVerification(auth.currentUser);
      setEmailLinkSent(true);
    } catch (err: unknown) {
      setContactError(mapFirebaseAuthError(err, 'Failed to link email'));
    } finally {
      setContactLoading(false);
    }
  };

  // After the user clicks the verification link in their inbox, force-refresh the
  // Firebase ID token (so it reflects emailVerified: true) and ask the server to persist it.
  const handleConfirmEmailVerified = async () => {
    setContactError(null);
    if (!auth.currentUser) {
      setContactError('Your Firebase session has expired - please sign out and sign in again.');
      return;
    }
    try {
      setContactLoading(true);
      const idToken = await auth.currentUser.getIdToken(true);
      const res = await fetch('/api/profile/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to verify email');
      setAddingEmail(false);
      setEmailLinkSent(false);
      setSuccessMsg('Email verified and linked to your account!');
      fetchProfile();
    } catch (err: unknown) {
      setContactError(getErrorMessage(err, 'Not verified yet - click the link in your email first.'));
    } finally {
      setContactLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Type DELETE (in capitals) to confirm.');
      return;
    }
    try {
      setDeleting(true);
      setDeleteError(null);
      const res = await fetch('/api/profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete account.');
      }
      await signOut({ callbackUrl: '/' });
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err, 'Could not delete account.'));
      setDeleting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="max-w-md mx-auto my-auto p-6 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900">Error Loading Profile</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">{error}</p>
        </div>
      </div>
    );
  }

  // Reachable at runtime only while still loading or after a fetch error,
  // both already returned above - this satisfies the type system's
  // (correct) inability to otherwise prove `profile` is non-null here.
  if (!profile) return null;

  const score = profile.reputationScore || 0;
  let tierLabel = 'New Member';
  let tierColor = 'bg-slate-100 text-slate-700 border-slate-200';
  if (score >= 30) {
    tierLabel = 'Trusted Member';
    tierColor = 'bg-emerald-500 text-white border-emerald-600';
  } else if (score >= 10) {
    tierLabel = 'Active Member';
    tierColor = 'bg-indigo-600 text-white border-indigo-700';
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex-1 w-full space-y-6">
        
        {/* Profile Completion Nudge Banner */}
        {showNudge && (
          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 mt-0.5">
                <User className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="font-bold text-slate-900 text-xs">Complete your profile</span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Adding a bio and profile photo helps finders and claimants trust your postings!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={dismissNudgeBanner}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition-all"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your personal credentials and view your community reputation history.
          </p>
        </div>

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Avatar & Trust badge */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
            {profile.photoUrl ? (
              <Image src={profile.photoUrl} alt="Avatar" width={80} height={80} className="rounded-full object-cover border border-slate-200 shadow-inner" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 text-2xl font-black shadow-inner">
                {profile.displayName?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div>
              <h2 className="font-bold text-lg text-slate-900">{profile.displayName}</h2>
              {profile.bio && <p className="text-xs text-slate-500 mt-1 italic max-w-xs">{profile.bio}</p>}
            </div>

            <div className="w-full border-t border-slate-100 pt-4 space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Community Standing
              </div>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${tierColor}`}>
                {tierLabel}
              </div>
              <div className="text-slate-600 font-extrabold text-sm mt-1">
                Score: {score} Points
              </div>
              {profile.ageBonus > 0 && (
                <div className="text-[10px] text-emerald-600 font-medium">
                  Includes +{profile.ageBonus} Age Loyalty Bonus
                </div>
              )}
            </div>
          </div>

          {/* Middle Column: Edit Settings */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm md:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">
              Account Details
            </h3>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Display Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                  />
                </div>
              </div>

              <ImageUploadField
                label="Profile Photo"
                value={photoUrl}
                onChange={setPhotoUrl}
                shape="circle"
                helperText="Uploaded from your device — shown on your public profile and posts."
              />

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Biography / Bio
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <textarea
                    rows={3}
                    placeholder="Tell the community about yourself..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Contact & Verification Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">
            Contact & Verification
          </h3>

          {contactError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{contactError}</span>
            </div>
          )}

          {/* Email row */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700 truncate">
                  {profile.email?.startsWith('phone_') ? 'No email on file' : profile.email}
                </span>
              </div>
              {profile.emailVerified && !profile.email?.startsWith('phone_') ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200 shrink-0">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddingEmail(!addingEmail); setContactError(null); }}
                  className="text-[10px] font-bold text-indigo-600 hover:underline shrink-0"
                >
                  {addingEmail ? 'Cancel' : 'Add & Verify Email'}
                </button>
              )}
            </div>

            {addingEmail && !profile.emailVerified && (
              emailLinkSent ? (
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                  <p className="text-xs text-slate-500">
                    Verification link sent to <strong>{newEmail}</strong>. Click it, then confirm below.
                  </p>
                  <button
                    type="button"
                    onClick={handleConfirmEmailVerified}
                    disabled={contactLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {contactLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>I&apos;ve Verified — Refresh Status</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAddEmail} className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Choose a password"
                    value={newEmailPassword}
                    onChange={(e) => setNewEmailPassword(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={contactLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {contactLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Send Verification Email</span>
                  </button>
                </form>
              )
            )}
          </div>
        </div>

        {/* Reputation Events History Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Award className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-sm">Recent Trust Score Actions</h3>
          </div>

          {profile.reputationEvents && profile.reputationEvents.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {profile.reputationEvents.map((evt) => {
                const isPositive = evt.points > 0;
                let title = evt.type;
                let desc = '';

                if (evt.type === 'CLAIM_APPROVED') {
                  title = 'Claim Approved';
                  desc = `Your verification claim was accepted by the item owner.`;
                } else if (evt.type === 'CLAIM_REJECTED') {
                  title = 'Claim Rejected';
                  desc = `Your claim was rejected by the item owner.`;
                } else if (evt.type === 'POST_RESOLVED') {
                  title = 'Post Resolved';
                  desc = `You successfully marked one of your posted items as closed.`;
                }

                return (
                  <div key={evt.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-slate-900">{title}</h4>
                      <p className="text-[11px] text-slate-400">{desc}</p>
                      <span className="text-[9px] text-slate-400 mt-1 block">
                        {new Date(evt.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-black shrink-0 px-2 py-0.5 rounded-md ${
                        isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {isPositive ? `+${evt.points}` : evt.points} pts
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-xs font-medium">
              No recent reputation events recorded yet.
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-2xl border border-rose-200 p-6 shadow-sm space-y-3">
          <h3 className="font-bold text-rose-700 text-sm pb-2 border-b border-rose-100">
            Danger Zone
          </h3>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-slate-900">Delete Account</p>
              <p className="text-xs text-slate-500 mt-0.5 max-w-md">
                Permanently deletes your account, posts, claims, registered items, messages,
                and reputation history. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setShowDeleteConfirm(true); setDeleteError(null); setDeleteConfirmText(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account</span>
            </button>
          </div>
        </div>
      </main>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-bold text-slate-900 text-base">Delete your account?</h3>
            </div>
            <p className="text-xs text-slate-500">
              This permanently deletes your account and everything tied to it — posts, claims,
              registered items, conversations, and reputation history. This cannot be undone.
              Type <span className="font-mono font-bold text-slate-800">DELETE</span> to confirm.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50/50"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
