'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { Navbar } from '@/components/Navbar';
import { CATEGORIES } from '@/data/posts';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { getErrorMessage } from '@/lib/errors';
import type { PostMatch } from '@/types/post';
import {
  Upload,
  ArrowLeft,
  Loader2,
  AlertCircle,
  X,
  MapPin,
  Navigation,
  Lock,
  Phone,
  Calendar,
  CheckCircle,
} from 'lucide-react';

const DynamicMapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-slate-400 text-xs font-semibold">
      Loading Interactive Map...
    </div>
  ),
});

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB, matches the server-side limit in /api/upload

const createPostSchema = z.object({
  type: z.enum(['LOST', 'FOUND'], {
    message: 'Please select whether the item was Lost or Found',
  }),
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters long')
    .max(100, 'Title is too long'),
  category: z.string().refine((val) => val !== 'All Categories' && val !== '', {
    message: 'Please select a valid category',
  }),
  locationText: z.string().min(3, 'Location description is required'),
  description: z
    .string()
    .min(3, 'Please provide a description (at least 3 characters)'),
  privateDetail: z.string().optional(),
  contactPhone: z.string().optional(),
  eventDateTime: z.string().optional(),
});

type CreatePostFormData = z.infer<typeof createPostSchema>;

interface SelectedImage {
  file?: File;
  previewUrl: string;
}

export default function CreatePostPage() {
  const router = useRouter();
  const { status } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  // Initialize coords to null initially; seeded from real geolocation below, or set
  // manually by clicking/dragging the pin on the map.
  const { coords: geoCoords, loading: gettingLocation, denied: locationDenied, retry: requestGeolocation } = useCurrentLocation();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  // FOUND-post-only: current item status + where it can be collected from / was deposited
  const [itemStatus, setItemStatus] = useState<'WITH_ME' | 'DEPOSITED'>('WITH_ME');
  const [depositLocationText, setDepositLocationText] = useState('');
  const [depositCoords, setDepositCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [itemStatusError, setItemStatusError] = useState<string | null>(null);

  // Success flow matches screen state
  const [successPost, setSuccessPost] = useState<{ id: string } | null>(null);
  const [matches, setMatches] = useState<PostMatch[]>([]);
  const [matchStatus, setMatchStatus] = useState<'idle' | 'checking' | 'done'>('idle');

  // Adopt each successful geolocation fix (initial mount + manual retries) as the
  // pinned location. On denial/timeout, coords stays whatever it was (null unless
  // the user has already pinned manually) — no hardcoded city fallback — and the
  // map below switches from a loading placeholder to an interactive manual-pin view.
  useEffect(() => {
    if (geoCoords) {
      setCoords(geoCoords);
      setLocationStatus(`Map centered to your current location (${geoCoords.lat.toFixed(4)}, ${geoCoords.lng.toFixed(4)})`);
    } else if (locationDenied) {
      setLocationStatus('Could not access your location — tap the map below to pin it manually.');
    }
  }, [geoCoords, locationDenied]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/sign-in');
    }
  }, [status, router]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreatePostFormData>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      type: 'LOST',
      category: '',
      locationText: '',
      privateDetail: '',
      contactPhone: '',
    },
  });

  const selectedType = watch('type');

  // Poll matches for successPost after creation
  useEffect(() => {
    if (!successPost) return;

    let attempts = 0;
    setMatchStatus('checking');

    const pollMatches = async () => {
      try {
        const res = await fetch(`/api/posts/${successPost.id}/matches`);
        if (!res.ok) throw new Error('Error fetching matches');
        const json = await res.json();
        
        const embeddingStatus = json.data?.embeddingStatus;
        const foundMatches = json.data?.matches || [];

        if (embeddingStatus === 'done' || attempts >= 4) {
          setMatches(foundMatches);
          setMatchStatus('done');
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error('Polling matches error:', err);
      }
      attempts++;
    };

    const intervalId = setInterval(pollMatches, 1500);
    pollMatches(); // immediate first call

    return () => clearInterval(intervalId);
  }, [successPost]);

  const handleUseCurrentLocation = () => {
    setLocationStatus(null);
    requestGeolocation();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    if (!e.target.files) return;

    const filesArray = Array.from(e.target.files);
    if (selectedImages.length + filesArray.length > 3) {
      setImageError('You can upload up to 3 photos maximum.');
      return;
    }

    const oversized = filesArray.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setImageError('Each image must be 8MB or smaller.');
      return;
    }

    const newEntries: SelectedImage[] = filesArray.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setSelectedImages((prev) => [...prev, ...newEntries]);
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: CreatePostFormData) => {
    try {
      setServerError(null);
      setImageError(null);
      setItemStatusError(null);

      if (selectedImages.length === 0) {
        setImageError('At least 1 item photo is required.');
        return;
      }

      if (!coords) {
        setServerError('Location map pin coordinate selection is required.');
        return;
      }

      if (data.type === 'FOUND' && itemStatus === 'DEPOSITED' && !depositLocationText.trim()) {
        setItemStatusError('Please describe where the item was deposited.');
        return;
      }

      setUploading(true);
      const uploadedUrls: string[] = [];

      for (const img of selectedImages) {
        if (img.file) {
          const formData = new FormData();
          formData.append('file', img.file);

          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          const uploadJson = await uploadRes.json();
          if (!uploadRes.ok) {
            throw new Error(uploadJson.error || 'Failed to upload image to storage');
          }
          const url = uploadJson.data?.url || uploadJson.url;
          if (!url) {
            throw new Error('Upload returned no URL');
          }
          uploadedUrls.push(url);
        } else {
          uploadedUrls.push(img.previewUrl);
        }
      }

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          lat: coords.lat,
          lng: coords.lng,
          imageUrls: uploadedUrls,
          itemStatus: data.type === 'FOUND' ? itemStatus : undefined,
          depositLocationText: data.type === 'FOUND' && itemStatus === 'DEPOSITED' ? depositLocationText.trim() : undefined,
          depositLat: data.type === 'FOUND' && itemStatus === 'DEPOSITED' ? depositCoords?.lat : undefined,
          depositLng: data.type === 'FOUND' && itemStatus === 'DEPOSITED' ? depositCoords?.lng : undefined,
        }),
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || resData.message || 'Failed to submit post');
      }

      setSuccessPost(resData.data);
    } catch (err: unknown) {
      console.error('Error creating post:', err);
      setServerError(getErrorMessage(err, 'Something went wrong while saving your post'));
    } finally {
      setUploading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  if (successPost) {
    const validMatches = matches.filter((m) => m.score >= 0.5);

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 w-full flex-1 flex flex-col justify-center">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-lg p-8 sm:p-10 text-center space-y-6">
            
            <div className="flex flex-col items-center gap-3">
              {matchStatus === 'checking' ? (
                <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center animate-pulse">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
              )}
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Post Created Successfully!
              </h1>
              <p className="text-slate-500 text-sm max-w-md">
                {matchStatus === 'checking'
                  ? 'Checking database for possible opposite matches using spatial proximity and smart text models...'
                  : validMatches.length > 0
                  ? `We found ${validMatches.length} possible matching items. Take a look below!`
                  : 'We couldn&apos;t find any matches nearby right now. We will notify you if a matching post is created!'}
              </p>
            </div>

            {matchStatus === 'checking' && (
              <div className="py-6 flex flex-col items-center text-slate-400 gap-2 text-xs font-semibold">
                <span>Checking matching engine...</span>
              </div>
            )}

            {matchStatus === 'done' && validMatches.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 text-left">
                {validMatches.slice(0, 3).map((match) => {
                  const p = match.matchedPost;
                  const isStrong = match.score >= 0.7;

                  return (
                    <div
                      key={match.id}
                      className="border border-slate-200 rounded-2xl p-4 hover:border-indigo-300 transition-all flex flex-col justify-between space-y-3 bg-slate-50/50 hover:bg-indigo-50/10 group"
                    >
                      <div className="flex gap-3">
                        <Image
                          src={p.photoUrl || 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=300&auto=format&fit=crop'}
                          alt={p.title}
                          width={64}
                          height={64}
                          className="rounded-xl object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mb-1.5 ${
                              isStrong ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isStrong ? 'Strong Match' : 'Possible Match'}
                          </span>
                          <h4 className="font-bold text-slate-900 text-sm line-clamp-1 group-hover:text-indigo-600 transition-colors">
                            {p.title}
                          </h4>
                          <p className="text-slate-500 text-xs line-clamp-1">
                            {p.description}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400">
                        <span className="truncate">{p.locationText}</span>
                        <Link
                          href={`/posts/${p.id}`}
                          className="font-bold text-indigo-600 hover:text-indigo-700 shrink-0"
                        >
                          View Details →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  router.push(`/posts/${successPost.id}`);
                  router.refresh();
                }}
                className="px-6 py-3 rounded-xl text-sm font-black bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm inline-flex items-center gap-2"
              >
                Continue to My Post
              </button>
            </div>

          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 w-full flex-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="border-b border-slate-100 pb-6 mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Post a Lost or Found Item</h1>
            <p className="text-slate-500 text-sm mt-1">
              Add photos and pin your location to help others find or return the item.
            </p>
          </div>

          {serverError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* 1. Type Toggle */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">
                Item Type <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setValue('type', 'LOST')}
                  className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 ${
                    selectedType === 'LOST'
                      ? 'border-rose-500 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  I Lost Something
                </button>
                <button
                  type="button"
                  onClick={() => setValue('type', 'FOUND')}
                  className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 ${
                    selectedType === 'FOUND'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  I Found Something
                </button>
              </div>
            </div>

            {/* 2. Photo Upload */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                Item Photos <span className="text-rose-500">*</span>{' '}
                <span className="text-slate-400 font-normal text-xs">(1 required, up to 3)</span>
              </label>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                multiple
                className="hidden"
              />

              <div className="grid grid-cols-3 gap-4 mt-2">
                {selectedImages.map((img, idx) => (
                  <div key={idx} className="relative h-32 rounded-xl overflow-hidden border border-slate-200 group bg-slate-100">
                    {/* unoptimized: local blob: object URL, not yet uploaded */}
                    <Image src={img.previewUrl} alt="Preview" fill sizes="(max-width: 640px) 33vw, 200px" unoptimized className="object-cover" />
                    {idx === 0 && (
                      <span className="absolute top-2 left-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Primary
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-2 right-2 bg-slate-900/80 hover:bg-rose-600 text-white p-1 rounded-full transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {selectedImages.length < 3 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-32 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-indigo-600"
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-xs font-semibold">Upload Photo</span>
                  </button>
                )}
              </div>
              {imageError && <p className="mt-2 text-xs text-rose-500 font-medium">{imageError}</p>}
            </div>

            {/* 3. Title */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                Item Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Black Sony Headphones"
                {...register('title')}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title.message}</p>}
            </div>

            {/* 4. Category */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                {...register('category')}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Select a category</option>
                {CATEGORIES.filter((c) => c !== 'All Categories').map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {errors.category && <p className="mt-1 text-xs text-rose-500">{errors.category.message}</p>}
            </div>

            {/* 5. Location Text & Geolocation Button */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-800">
                  Location Description <span className="text-rose-500">*</span>
                </label>

                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={gettingLocation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-200/60"
                >
                  {gettingLocation ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{gettingLocation ? 'Locating...' : 'Use My Current Location'}</span>
                </button>
              </div>

              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. Near Central Park Fountain or Student Library"
                  {...register('locationText')}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {errors.locationText && <p className="mt-1 text-xs text-rose-500">{errors.locationText.message}</p>}

              {locationStatus && (
                <p className={`text-xs ${coords ? 'text-emerald-600 font-medium' : 'text-amber-600'}`}>
                  {locationStatus}
                </p>
              )}

              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Pin exact spot on Map <span className="text-rose-500">*</span> <span className="text-slate-400 font-normal">(Click or drag marker)</span>
                </label>
                {gettingLocation ? (
                  <div className="h-64 w-full bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-slate-400 text-xs font-semibold">
                    Requesting your location to initialize map view...
                  </div>
                ) : (
                  <DynamicMapView
                    interactivePin={true}
                    selectedPos={coords ? [coords.lat, coords.lng] : null}
                    onSelectPos={(lat, lng) => setCoords({ lat, lng })}
                    height="260px"
                    zoom={coords ? 15 : 5}
                  />
                )}
              </div>
            </div>

            {/* Date/Time Lost or Found */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                Date/Time {selectedType === 'FOUND' ? 'Found' : 'Lost'}{' '}
                <span className="text-slate-400 font-normal text-xs">(Optional)</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="datetime-local"
                  {...register('eventDateTime')}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* FOUND-post-only: current item status + where it can be collected from / was deposited */}
            {selectedType === 'FOUND' && (
              <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200/80 space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">
                    Current Status of Item <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-white p-1 rounded-xl border border-emerald-200/60">
                    <button
                      type="button"
                      onClick={() => setItemStatus('WITH_ME')}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        itemStatus === 'WITH_ME'
                          ? 'bg-emerald-600 text-white shadow-xs'
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
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Deposited somewhere
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {itemStatus === 'WITH_ME' ? 'Where can this item be collected from?' : 'Deposit Location Description'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={
                      itemStatus === 'WITH_ME'
                        ? 'e.g. Hostel Block C, Room 214'
                        : 'e.g. Handed over to security desk / lost-and-found office'
                    }
                    value={depositLocationText}
                    onChange={(e) => setDepositLocationText(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  {itemStatusError && <p className="mt-1 text-xs text-rose-500">{itemStatusError}</p>}

                  <label className="block text-xs font-semibold text-slate-500 mt-3 mb-1.5">
                    Pin this spot on the map <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <DynamicMapView
                    interactivePin={true}
                    selectedPos={depositCoords ? [depositCoords.lat, depositCoords.lng] : null}
                    onSelectPos={(lat, lng) => setDepositCoords({ lat, lng })}
                    center={coords ? [coords.lat, coords.lng] : undefined}
                    height="200px"
                    zoom={14}
                  />
                </div>
              </div>
            )}

            {/* 6. Description */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                Public Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                placeholder="Describe the item, features, where you lost/found it..."
                {...register('description')}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.description && <p className="mt-1 text-xs text-rose-500">{errors.description.message}</p>}
            </div>

            {/* 7. Private Verifying Detail */}
            <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200/80 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>Private Verifying Detail (Optional / Recommended)</span>
              </div>
              <p className="text-xs text-amber-800/80">
                Information only YOU know (e.g. wallet contents, phone lock screen wallpaper, key ring count). This is NEVER shown publicly — it will only be used to compare against a claimant&apos;s answer when you review claims on this post.
              </p>
              <textarea
                rows={2}
                placeholder="e.g. Lock screen has a picture of a golden retriever; sticker inside case."
                {...register('privateDetail')}
                className="w-full px-3.5 py-2 rounded-xl border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>

            {/* 8. Contact Phone */}
            {selectedType === 'FOUND' && (
              <div className="space-y-1">
                <label className="block text-sm font-semibold text-slate-800">
                  Contact Phone Number <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. +1 (555) 000-1234"
                    {...register('contactPhone')}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || uploading}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {(isSubmitting || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{uploading ? 'Uploading Images...' : isSubmitting ? 'Saving...' : 'Post Item'}</span>
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
