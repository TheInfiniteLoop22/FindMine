'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { CATEGORIES } from '@/data/posts';
import type { RegisteredItemSummary } from '@/types/registeredItem';

import { getErrorMessage } from '@/lib/errors';
interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: RegisteredItemSummary | null;
  onItemUpdated: () => void;
}

export const EditItemModal: React.FC<EditItemModalProps> = ({
  isOpen,
  onClose,
  item,
  onItemUpdated,
}) => {
  const [nickname, setNickname] = useState('');
  const [category, setCategory] = useState('');
  const [contactMode, setContactMode] = useState<'SHOW_EMAIL' | 'RELAY_ONLY'>('RELAY_ONLY');

  // Locked to the user's own account email — see registered-items API routes
  // for why this can't be free text. (Phone contact mode was removed entirely.)
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item && isOpen) {
      setNickname(item.nickname || '');
      setCategory(item.category || '');
      setContactMode(item.contactMode === 'SHOW_EMAIL' ? 'SHOW_EMAIL' : 'RELAY_ONLY');
      setError(null);

      fetch('/api/profile')
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          const data = json?.data;
          if (!data) return;
          setAccountEmail(data.email || null);
        })
        .catch((err) => console.error('Failed to load profile for contact info:', err));
    }
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('Item Nickname is required.');
      return;
    }
    if (contactMode === 'SHOW_EMAIL' && !accountEmail) {
      setError('Your account email could not be loaded. Please try again.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/registered-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          category: category || null,
          contactMode,
          email: contactMode === 'SHOW_EMAIL' ? accountEmail : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save changes.');
      }

      onItemUpdated();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, 'Error saving item.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">Edit Item Details</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Item Nickname *
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
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

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Contact Mode Options
            </label>

            <div className="grid grid-cols-1 gap-2.5">
              <label className={`border rounded-xl p-3 flex items-start gap-2.5 cursor-pointer text-xs ${
                contactMode === 'RELAY_ONLY' ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200'
              }`}>
                <input
                  type="radio"
                  name="editContactMode"
                  value="RELAY_ONLY"
                  checked={contactMode === 'RELAY_ONLY'}
                  onChange={() => setContactMode('RELAY_ONLY')}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <span className="font-bold text-slate-900 block">Relay Only (Secure)</span>
                </div>
              </label>

              <label className={`border rounded-xl p-3 flex items-start gap-2.5 cursor-pointer text-xs ${
                contactMode === 'SHOW_EMAIL' ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200'
              }`}>
                <input
                  type="radio"
                  name="editContactMode"
                  value="SHOW_EMAIL"
                  checked={contactMode === 'SHOW_EMAIL'}
                  onChange={() => setContactMode('SHOW_EMAIL')}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <span className="font-bold text-slate-900 block">Reveal Email Address</span>
                </div>
              </label>
            </div>
          </div>

          {contactMode === 'SHOW_EMAIL' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Your Contact Email Address
              </label>
              <input
                type="email"
                readOnly
                value={accountEmail || ''}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-100 text-slate-700 cursor-not-allowed"
              />
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
