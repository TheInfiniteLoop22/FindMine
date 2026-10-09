'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { X, Loader2, AlertCircle, ShieldCheck, Lock, Calendar } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';

import { getErrorMessage } from '@/lib/errors';
const DynamicMapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="h-44 w-full bg-slate-100 animate-pulse rounded-2xl" />,
});

interface ClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postTitle: string;
  postType: 'LOST' | 'FOUND';
  hasPrivateDetail?: boolean;
  onClaimSubmitted: () => void;
}

export const ClaimModal: React.FC<ClaimModalProps> = ({
  isOpen,
  onClose,
  postId,
  postTitle,
  postType,
  hasPrivateDetail = false,
  onClaimSubmitted,
}) => {
  const isLostPost = postType === 'LOST';

  // Base state fields
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Common context
  const [answerText, setAnswerText] = useState('');

  // Finder (claim on LOST post) states
  const [proofImageUrl, setProofImageUrl] = useState('');
  const [foundAt, setFoundAt] = useState('');
  const [itemStatus, setItemStatus] = useState<'WITH_ME' | 'DEPOSITED'>('WITH_ME');
  const [depositLocation, setDepositLocation] = useState('');
  const [depositCoords, setDepositCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Loser (claim on FOUND post) states
  const [privateDetailAnswer, setPrivateDetailAnswer] = useState('');

  // Only request geolocation once the claim modal actually opens (not on every post
  // detail page load) — used purely to center the deposit-location map, not to
  // pre-select a pin, since the item's actual deposit spot may not be where the
  // claimant is standing right now.
  const { coords: geoCoords, retry: requestGeolocation } = useCurrentLocation({ immediate: false });
  useEffect(() => {
    if (isOpen) requestGeolocation();
  }, [isOpen, requestGeolocation]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Build payload and validate client-side
    const payload: {
      privateDetailAnswer?: string;
      foundAt?: string;
      itemStatus?: 'WITH_ME' | 'DEPOSITED';
      depositLocation?: string;
      depositLat?: number;
      depositLng?: number;
      proofImageUrl?: string;
      answerText?: string;
    } = {};

    if (isLostPost) {
      if (!proofImageUrl.trim()) {
        setError('Photo proof is required — it serves as evidence you actually have the item.');
        return;
      }
      if (!foundAt) {
        setError('Please select the date/time you found the item.');
        return;
      }
      if (itemStatus === 'DEPOSITED' && !depositLocation.trim()) {
        setError('Please specify where the item was deposited.');
        return;
      }
      if (hasPrivateDetail) {
        if (!privateDetailAnswer.trim()) {
          setError('Please answer the private verification question set by the owner.');
          return;
        }
        payload.privateDetailAnswer = privateDetailAnswer.trim();
      }
      payload.foundAt = foundAt;
      payload.itemStatus = itemStatus;
      payload.depositLocation = depositLocation.trim() || undefined;
      payload.depositLat = depositCoords?.lat;
      payload.depositLng = depositCoords?.lng;
      payload.proofImageUrl = proofImageUrl.trim();
      payload.answerText = answerText.trim() || undefined;
    } else {
      // Claiming a FOUND post
      if (hasPrivateDetail) {
        if (!privateDetailAnswer.trim()) {
          setError('Please provide your answer to the verify question.');
          return;
        }
        payload.privateDetailAnswer = privateDetailAnswer.trim();
        payload.answerText = answerText.trim() || undefined;
      } else {
        if (!answerText.trim()) {
          setError('Please describe the identifying detail.');
          return;
        }
        payload.answerText = answerText.trim();
      }
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/posts/${postId}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit claim');
      }

      onClaimSubmitted();
      onClose();
    } catch (err: unknown) {
      console.error('Claim submission error:', err);
      setError(getErrorMessage(err, 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-3 text-indigo-600">
          <ShieldCheck className="w-6 h-6" />
          <span className="text-xs font-bold uppercase tracking-wider bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
            {isLostPost ? 'I Found It!' : 'I Lost It!'} Claim Form
          </span>
        </div>

        <h3 className="text-xl font-bold text-slate-900 leading-snug">
          Claiming: &quot;{postTitle}&quot;
        </h3>

        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          
          {/* RENDER FINDER FORM (CLAIMING A LOST POST) */}
          {isLostPost ? (
            <>
              {/* Photo Proof Upload — required, proves possession */}
              <ImageUploadField
                label="Photo Proof"
                required
                value={proofImageUrl}
                onChange={setProofImageUrl}
                helperText="A photo of the item you found — required proof that you actually have it."
              />

              {/* Date/Time Found */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Date/Time Found <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="datetime-local"
                    value={foundAt}
                    onChange={(e) => setFoundAt(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                  />
                </div>
              </div>

              {/* WITH_ME / DEPOSITED Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Current Status of Item <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setItemStatus('WITH_ME')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      itemStatus === 'WITH_ME'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    I have it with me
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemStatus('DEPOSITED')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      itemStatus === 'DEPOSITED'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Deposited somewhere
                  </button>
                </div>
              </div>

              {/* Location Description + Map Pin — where the item can be collected from (WITH_ME)
                  or where it was deposited (DEPOSITED). Required only for DEPOSITED, since a
                  finder holding onto the item may not have settled on a handoff spot yet. */}
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {itemStatus === 'WITH_ME' ? 'Where can this item be collected from?' : 'Deposit Location Description'}{' '}
                  {itemStatus === 'DEPOSITED' && <span className="text-rose-500">*</span>}
                </label>
                <input
                  type="text"
                  placeholder={
                    itemStatus === 'WITH_ME'
                      ? 'e.g. Hostel Block C, Room 214'
                      : 'e.g. Handed over to police booth / reception desk...'
                  }
                  value={depositLocation}
                  onChange={(e) => setDepositLocation(e.target.value)}
                  required={itemStatus === 'DEPOSITED'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                />

                <label className="block text-[10px] font-semibold text-slate-500 mt-2.5 mb-1">
                  Pin this spot on the map <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <DynamicMapView
                  interactivePin={true}
                  selectedPos={depositCoords ? [depositCoords.lat, depositCoords.lng] : null}
                  onSelectPos={(lat, lng) => setDepositCoords({ lat, lng })}
                  center={geoCoords ? [geoCoords.lat, geoCoords.lng] : undefined}
                  height="180px"
                  zoom={14}
                />
              </div>

              {/* Context text box */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Additional Details / Context <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Describe where you found it or other notes..."
                  className="w-full p-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                />
              </div>

              {/* Private verification question set by the owner when they posted this LOST item */}
              {hasPrivateDetail && (
                <>
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Security Verification Required</span>
                    </div>
                    <p className="text-amber-800">
                      The owner set a private verification detail for this item. Describe what you remember (e.g. unique scratches, serial numbers, contents) so they can confirm you actually found their item.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Private Detail Answer / Description <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={privateDetailAnswer}
                      onChange={(e) => setPrivateDetailAnswer(e.target.value)}
                      required
                      placeholder="Enter the identifying detail you observed on the item..."
                      className="w-full p-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            
            /* RENDER LOSER FORM (CLAIMING A FOUND POST) */
            <>
              {hasPrivateDetail ? (
                <>
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Security Verification Required</span>
                    </div>
                    <p className="text-amber-800">
                      The finder set a private verification question for this item. Describe what you remember (e.g. unique scratches, serial numbers, wallpapers, contents) so they can verify you are the owner.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Private Question Answer / Description <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={privateDetailAnswer}
                      onChange={(e) => setPrivateDetailAnswer(e.target.value)}
                      required
                      placeholder="Enter details only the owner would know..."
                      className="w-full p-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Identifying Details / Explanation <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    required
                    placeholder="Describe specific features, colors, markings, or contents to prove ownership..."
                    className="w-full p-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                  />
                </div>
              )}

              {/* Extra context — only shown alongside the private-detail answer, since the
                  free-text box above already covers this when there's no private detail. */}
              {hasPrivateDetail && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Additional Message <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Provide additional details or contact instructions..."
                    className="w-full p-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                  />
                </div>
              )}
            </>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Submitting...' : 'Submit Claim'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
