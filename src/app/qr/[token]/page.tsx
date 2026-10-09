'use client';

import React, { useState, useEffect, use } from 'react';
import Image from 'next/image';
import { Loader2, AlertCircle, Mail, AlertTriangle, Send, CheckCircle2 } from 'lucide-react';
import type { QrScanResult } from '@/types/registeredItem';

import { getErrorMessage } from '@/lib/errors';
export default function PublicScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [item, setItem] = useState<QrScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Relay Message Form States
  const [message, setMessage] = useState('');
  const [finderContact, setFinderContact] = useState('');
  const [submittingMsg, setSubmittingMsg] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetch(`/api/qr/${token}`)
        .then((res) => {
          if (res.status === 404) {
            throw new Error('This code is not recognized.');
          }
          if (!res.ok) {
            throw new Error('Could not read code information.');
          }
          return res.json();
        })
        .then((json) => {
          setItem(json.data);
          setLoading(false);
        })
        .catch((err: unknown) => {
          setError(getErrorMessage(err, 'Scanning error occurred.'));
          setLoading(false);
        });
    }
  }, [token]);

  const handleSendRelay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      setSubmittingMsg(true);
      setMsgError(null);
      setMsgSuccess(false);

      const res = await fetch(`/api/qr/${token}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          finderContact: finderContact.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to transmit message.');
      }

      setMsgSuccess(true);
      setMessage('');
      setFinderContact('');
    } catch (err: unknown) {
      console.error(err);
      setMsgError(getErrorMessage(err, 'Failed to submit relay message.'));
    } finally {
      setSubmittingMsg(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Scanning tag...</span>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 p-6 rounded-3xl text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-white">Scan Failed</h2>
          <p className="text-sm text-slate-400">{error || 'This code is not recognized.'}</p>
          <p className="text-[11px] text-slate-500">
            Please make sure the QR tag is printed clearly and clean of marks.
          </p>
        </div>
      </div>
    );
  }

  const isLost = item.status === 'LOST_REPORTED';
  const displayImage = item.photoUrl || 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=400&auto=format&fit=crop';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        
        {/* Banner for Lost Status */}
        {isLost && (
          <div className="bg-rose-600 px-6 py-3.5 flex flex-col gap-0.5 text-xs font-bold text-white uppercase tracking-wider text-center">
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce" />
              <span>This item was reported lost!</span>
            </div>
            {item.lostAt && (
              <span className="text-[10px] text-rose-200">
                Reported on {new Date(item.lostAt).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {/* Thumbnail Image */}
        <div className="relative h-64 bg-slate-950 border-b border-slate-900">
          <Image src={displayImage} alt={item.nickname} fill sizes="(max-width: 640px) 100vw, 500px" className="object-cover" />
        </div>

        {/* Details and Actions */}
        <div className="p-6 space-y-6">
          <div className="text-center space-y-1">
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
              {item.category || 'General'} Tag
            </span>
            <h1 className="text-xl font-black text-white leading-tight">
              {item.nickname}
            </h1>
            <p className="text-xs text-slate-400">
              Belongs to <span className="font-semibold text-slate-200">{item.ownerName}</span>
            </p>
          </div>

          <div className="border-t border-slate-900 pt-5 space-y-4">
            
            {item.contactMode === 'SHOW_EMAIL' && item.email && (
              <div className="bg-slate-900/65 border border-slate-800 p-4 rounded-2xl space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Send Email Message</span>
                </span>
                <p className="text-sm font-bold text-white font-mono">{item.email}</p>
              </div>
            )}

            {item.contactMode === 'RELAY_ONLY' && (
              <div className="space-y-4">
                
                {msgSuccess ? (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-800 text-emerald-400 rounded-2xl text-xs space-y-1.5 text-center py-6">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                    <span className="font-bold text-white block text-sm">Message Sent Successfully!</span>
                    <p className="text-slate-400">
                      The owner has been notified. They will contact you shortly if contact details were shared.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendRelay} className="space-y-4 bg-slate-900/30 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Send Secure Message to Owner
                    </span>

                    {msgError && (
                      <div className="p-3 bg-rose-950/20 border border-rose-900 text-rose-400 rounded-xl text-[10px] flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>{msgError}</span>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">
                        Your Message *
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="e.g. I found your bag at the coffee shop counter!"
                        className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">
                        Your Contact Info (Optional)
                      </label>
                      <input
                        type="text"
                        value={finderContact}
                        onChange={(e) => setFinderContact(e.target.value)}
                        placeholder="e.g. Phone or email for reply"
                        className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingMsg}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                    >
                      {submittingMsg ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Send Message</span>
                    </button>
                  </form>
                )}

              </div>
            )}

          </div>

          <div className="text-center pt-2 border-t border-slate-900">
            <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">
              Secured by FindMine
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}
