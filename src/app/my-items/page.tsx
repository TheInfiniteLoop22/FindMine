'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/EmptyState';
import { QRCodeDownloadButton } from '@/components/QRCodeDownloadButton';
import { EditItemModal } from '@/components/EditItemModal';
import { Loader2, AlertCircle, PlusCircle, Trash2, Edit2, QrCode } from 'lucide-react';
import type { RegisteredItemSummary } from '@/types/registeredItem';

import { getErrorMessage } from '@/lib/errors';
export default function MyRegisteredItemsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <MyRegisteredItemsPageInner />
    </Suspense>
  );
}

function MyRegisteredItemsPageInner() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightedItemId = searchParams.get('item');

  const [items, setItems] = useState<RegisteredItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit / Delete action states
  const [selectedItem, setSelectedItem] = useState<RegisteredItemSummary | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = React.useCallback(() => {
    fetch('/api/registered-items/mine')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to retrieve your registered items.');
        }
        return res.json();
      })
      .then((json) => {
        setItems(json.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(getErrorMessage(err, 'Could not fetch your registered items.'));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/sign-in');
      return;
    }

    if (status === 'authenticated') {
      fetchItems();
    }
  }, [status, router, fetchItems]);

  useEffect(() => {
    if (!highlightedItemId || items.length === 0) return;
    const el = document.getElementById(`item-${highlightedItemId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedItemId, items]);

  const handleToggleStatus = async (item: RegisteredItemSummary) => {
    const nextStatus = item.status === 'ACTIVE' ? 'LOST_REPORTED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/registered-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) throw new Error('Status update failed.');
      fetchItems();
    } catch (err: unknown) {
      console.error(err);
      alert(getErrorMessage(err, 'Could not toggle item status.'));
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to permanently delete this registration? All scan logs will be removed.')) {
      return;
    }

    try {
      setDeletingId(itemId);
      const res = await fetch(`/api/registered-items/${itemId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Delete request failed.');
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err: unknown) {
      console.error(err);
      alert(getErrorMessage(err, 'Could not delete item.'));
    } finally {
      setDeletingId(null);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900">My Registered Items</h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage pre-registered belongings, stickers, and scan alerts.
            </p>
          </div>

          <Link
            href="/my-items/new"
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-xs shrink-0 self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Register New Item</span>
          </Link>
        </div>

        {error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-6 rounded-2xl text-center max-w-md mx-auto my-8">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
            <p className="font-semibold text-sm">{error}</p>
          </div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {items.map((item) => {
              const image = item.photoUrl || 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=300&auto=format&fit=crop';
              const isLost = item.status === 'LOST_REPORTED';

              const isHighlighted = highlightedItemId === item.id;

              return (
                <div
                  key={item.id}
                  id={`item-${item.id}`}
                  className={`bg-white rounded-3xl border overflow-hidden shadow-xs hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between ${
                    isHighlighted ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className="relative h-48 bg-slate-50 border-b border-slate-100 shrink-0">
                      <Image src={image} alt={item.nickname} fill sizes="(max-width: 640px) 100vw, 400px" className="object-cover" />
                      <div className="absolute top-3 left-3 flex gap-1.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white shadow-2xs ${
                          isLost ? 'bg-rose-600 animate-pulse' : 'bg-indigo-600'
                        }`}>
                          {isLost ? 'Reported Lost' : 'Active'}
                        </span>
                      </div>
                      
                      {/* Action buttons on Image */}
                      <div className="absolute top-3 right-3 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItem(item);
                            setIsEditOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-white/90 text-slate-700 hover:text-slate-900 border border-slate-200/50 shadow-2xs transition-all"
                          title="Edit Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={deletingId === item.id}
                          className="p-1.5 rounded-lg bg-rose-50/95 text-rose-600 hover:text-rose-700 border border-rose-200/50 shadow-2xs transition-all"
                          title="Delete Registration"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {item.category || 'General'}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base mt-0.5 leading-tight">
                          {item.nickname}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Contact Mode: <span className="font-semibold text-slate-700">{item.contactMode}</span>
                        </p>
                      </div>

                      <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Scans: <span className="font-bold text-slate-800">{item.scanCount}</span></span>
                        {item.lastScannedAt ? (
                          <span>Scanned {new Date(item.lastScannedAt).toLocaleDateString()}</span>
                        ) : (
                          <span>Never scanned</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 pt-0 space-y-2">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(item)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-all text-center border shadow-3xs ${
                        isLost
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                      }`}
                    >
                      {isLost ? 'Mark Found' : 'Report Lost'}
                    </button>

                    <QRCodeDownloadButton
                      publicToken={item.publicToken}
                      nickname={item.nickname}
                      className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
                      buttonText="Download QR Label"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={QrCode}
            title="No registered items yet"
            description="Proactively register your belongings and print QR stickers so finders can reach you instantly."
            actionLabel="Register Your First Item"
            actionHref="/my-items/new"
          />
        )}
      </main>

      <EditItemModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        item={selectedItem}
        onItemUpdated={fetchItems}
      />
    </div>
  );
}
