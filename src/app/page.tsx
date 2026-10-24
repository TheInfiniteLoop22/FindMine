'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { Navbar } from '@/components/Navbar';
import { PostCard } from '@/components/PostCard';
import { PostCardSkeleton } from '@/components/PostCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { CATEGORIES, PostItem, PostType, PostImageItem } from '@/data/posts';
import type { PostSummary } from '@/types/post';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { Search, AlertCircle, Loader2, LayoutGrid, Map as MapIcon, SearchX, Navigation, MapPin, User } from 'lucide-react';

const DynamicMapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-[550px] w-full bg-slate-100 animate-pulse rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-2 font-semibold">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      <span>Loading interactive map view...</span>
    </div>
  ),
});

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const urlType = (searchParams.get('type')?.toUpperCase() as PostType | 'ALL') || 'ALL';
  const urlCategory = searchParams.get('category') || 'All Categories';
  const urlQuery = searchParams.get('q') || '';

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<PostType | 'ALL'>(urlType);
  const [selectedCategory, setSelectedCategory] = useState<string>(urlCategory);
  const [searchQuery, setSearchQuery] = useState<string>(urlQuery);

  // Near Me Radius Map States
  const { coords: geoCoords, loading: locatingUser, denied: locationDenied, retry: requestLocation } = useCurrentLocation();
  const [nearMeActive, setNearMeActive] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Radius presets: "Focused search" (500m / 0.5km) & "Broad search" (2km)
  const [radiusKm, setRadiusKm] = useState<number>(0.5);

  // Profile completion banner state
  const [showNudge, setShowNudge] = useState(false);

  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const updateUrlParams = useCallback(
    (newType: string, newCategory: string, newQuery: string) => {
      const params = new URLSearchParams();
      if (newType !== 'ALL') params.set('type', newType.toLowerCase());
      if (newCategory !== 'All Categories') params.set('category', newCategory);
      if (newQuery.trim() !== '') params.set('q', newQuery.trim());

      const queryString = params.toString();
      const newPath = queryString ? `/?${queryString}` : '/';
      router.push(newPath, { scroll: false });
    },
    [router]
  );

  const fetchPosts = useCallback(
    async (
      type: string,
      category: string,
      query: string,
      fetchPage: number,
      append: boolean = false,
      coords: { lat: number; lng: number } | null = null,
      radius: number = 0.5
    ) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const params = new URLSearchParams();
        if (type !== 'ALL') params.set('type', type.toLowerCase());
        if (category !== 'All Categories') params.set('category', category);
        if (query.trim() !== '') params.set('q', query.trim());
        params.set('page', fetchPage.toString());
        params.set('limit', '100'); // Higher limit for maps view display

        if (coords) {
          params.set('nearLat', coords.lat.toString());
          params.set('nearLng', coords.lng.toString());
          params.set('radiusKm', radius.toString());
        }

        const res = await fetch(`/api/posts?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Failed to fetch posts');
        }
        const json = await res.json();

        // The list/grid view shows every status (PostCard renders a badge for
        // non-OPEN posts); MapView independently filters to OPEN Lost/Found pins
        // internally, so the map-only exclusion the spec asked for still applies
        // there without narrowing what the list view gets to show.
        const fetchedPosts: PostItem[] = ((json.data || []) as PostSummary[])
          .map((p) => ({
            id: p.id,
            type: p.type,
            status: p.status || 'OPEN',
            title: p.title,
            description: p.description,
            category: p.category,
            locationText: p.locationText || 'Location specified',
            lat: p.lat,
            lng: p.lng,
            distance_km: p.distance_km,
            eventDateTime: p.createdAt,
            imageUrl:
              p.images?.find((img: PostImageItem) => img.isPrimary)?.url ||
              p.images?.[0]?.url ||
              p.photoUrl ||
              'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=300&auto=format&fit=crop',
            images: p.images,
            createdAt: p.createdAt,
            userDisplayName: p.user?.displayName || 'Community Member',
          }));

        if (append) {
          setPosts((prev) => [...prev, ...fetchedPosts]);
        } else {
          setPosts(fetchedPosts);
        }

        setHasMore(json.pagination?.hasMore || false);
        setPage(fetchPage);
      } catch (err: unknown) {
        console.error('Fetch error:', err);
        setError('Could not load posts from database.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Fetch profile to verify profile completion nudge details
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetch('/api/profile')
        .then((res) => res.json())
        .then((json) => {
          if (json.data) {
            const dismissNudge = localStorage.getItem(`dismiss_nudge_${json.data.id}`);
            if (!json.data.photoUrl && !json.data.bio && !dismissNudge) {
              setShowNudge(true);
            }
          }
        })
        .catch((err) => console.error('Error fetching profile for nudge alert:', err));
    }
  }, [status, session]);

  // Adopt each successful geolocation fix (initial mount + manual retries via
  // `requestLocation`) as the active scan center and switch Near Me on. On
  // denial/timeout, geoCoords simply stays null — no hardcoded city fallback —
  // so the map falls back to MapView's own single default view instead.
  useEffect(() => {
    if (geoCoords) {
      setUserCoords(geoCoords);
      setNearMeActive(true);
    }
  }, [geoCoords]);

  // Main fetch query binding
  useEffect(() => {
    fetchPosts(urlType, urlCategory, urlQuery, 1, false, nearMeActive ? userCoords : null, radiusKm);
  }, [urlType, urlCategory, urlQuery, nearMeActive, userCoords, radiusKm, fetchPosts]);

  // Polling mechanism: Poll radius query every 25 seconds while tab is active and map is visible
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    if (viewMode === 'map' && nearMeActive && userCoords) {
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          console.log('[Map Polling] Reloading radius activity pins...');
          fetchPosts(urlType, urlCategory, urlQuery, 1, false, userCoords, radiusKm);
        }
      }, 25000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [viewMode, nearMeActive, userCoords, radiusKm, urlType, urlCategory, urlQuery, fetchPosts]);

  const handleToggleNearMe = () => {
    if (!nearMeActive) {
      requestLocation();
    } else {
      setNearMeActive(false);
    }
  };

  const handleTypeChange = (type: PostType | 'ALL') => {
    setSelectedType(type);
    updateUrlParams(type, selectedCategory, searchQuery);
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    updateUrlParams(selectedType, cat, searchQuery);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlParams(selectedType, selectedCategory, searchQuery);
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) return;
    fetchPosts(selectedType, selectedCategory, searchQuery, page + 1, true, nearMeActive ? userCoords : null, radiusKm);
  };

  const updateScanCenter = (newLat: number, newLng: number) => {
    setUserCoords({ lat: newLat, lng: newLng });
  };

  const dismissNudgeBanner = () => {
    if (session?.user?.id) {
      localStorage.setItem(`dismiss_nudge_${session.user.id}`, 'true');
    }
    setShowNudge(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      {/* Profile Completion Nudge Banner */}
      {showNudge && (
        <div className="bg-indigo-50 border-b border-indigo-100 p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
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
              <Link
                href="/profile"
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold transition-all shadow-xs"
              >
                Go to Profile
              </Link>
              <button
                type="button"
                onClick={dismissNudgeBanner}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition-all bg-white"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/70 via-slate-50 to-slate-50 border-b border-slate-200/60 py-10 px-4 sm:px-6">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-glow-orb" aria-hidden="true" />
        <div className="absolute -top-16 right-0 w-80 h-80 bg-glow-orb opacity-70" aria-hidden="true" />

        <div className="relative max-w-4xl mx-auto text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/80 text-indigo-700 border border-indigo-100 shadow-xs">
            Community Lost &amp; Found
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Explore Activity Near You
          </h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-xl mx-auto">
            Search, browse the map, and reconnect with lost items being found across your community — in real time.
          </p>
        </div>

        {/* Geolocation Denied Banner Warning */}
        {locationDenied && (
          <div className="max-w-xl mx-auto mt-6 p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <Navigation className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-left">
                <span className="font-bold text-xs">Location Access Required</span>
                <p className="text-[10px] text-amber-700 mt-0.5">
                  Enable location permissions to scan nearby activity. Falling back to default coordinates.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestLocation}
              className="px-3.5 py-1.5 bg-amber-600 text-white font-bold rounded-xl text-[10px] hover:bg-amber-700 transition-colors"
            >
              Enable Location
            </button>
          </div>
        )}

        {/* Filter Bar with PostGIS Radius Toggle */}
        <form
          onSubmit={handleSearchSubmit}
          className="max-w-5xl mx-auto mt-6 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3 md:space-y-0 md:flex md:items-center md:gap-3"
        >
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, description, or location..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50/50"
            />
          </div>

          {/* Near Me Spatial Radius Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleNearMe}
              disabled={locatingUser}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                nearMeActive
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {locatingUser ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Navigation className="w-3.5 h-3.5" />
              )}
              <span>{locatingUser ? 'Locating...' : nearMeActive ? 'Near Me On' : 'Near Me'}</span>
            </button>

            {nearMeActive && (
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
                className="px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-700"
              >
                <option value={0.5}>Focused (500m)</option>
                <option value={2.0}>Broad (2km)</option>
              </select>
            )}
          </div>

          {/* Type Toggles */}
          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            {(['ALL', 'LOST', 'FOUND'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedType === type
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type === 'ALL' ? 'All' : type}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <div className="shrink-0">
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full md:w-36 px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 font-medium"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </form>
      </section>

      {/* Main Feed Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>{viewMode === 'map' ? 'Map Overview' : 'Recent Items'}</span>
            <span className="text-sm font-normal text-slate-500">({posts.length})</span>
          </h2>

          <div className="flex items-center bg-slate-200/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'map'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map View</span>
            </button>
          </div>
        </div>

        {/* Scan Area Controls Info */}
        {viewMode === 'map' && nearMeActive && userCoords && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between text-xs text-indigo-900 shadow-3xs max-w-5xl mx-auto">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Scanning a <strong>{radiusKm === 0.5 ? 'Focused (500m)' : 'Broad (2km)'}</strong> radius area centered around ({userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)}).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setUserCoords({ lat: userCoords.lat, lng: userCoords.lng })}
              className="text-[10px] font-black uppercase text-indigo-700 hover:text-indigo-900 transition-colors"
            >
              Re-Scan Area
            </button>
          </div>
        )}

        {/* Feed State handling */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <PostCardSkeleton key={idx} />
            ))}
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-6 rounded-2xl text-center max-w-md mx-auto my-8">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
            <p className="font-semibold text-sm">{error}</p>
          </div>
        ) : viewMode === 'map' ? (
          <div className="space-y-3">
            <DynamicMapView
              posts={posts}
              height="600px"
              zoom={14}
              selectedPos={userCoords ? [userCoords.lat, userCoords.lng] : null}
              onSelectPos={updateScanCenter}
            />
            <p className="text-xs text-center text-slate-500">
              Drag the blue center pin to scan different parts of the map. Only OPEN lost and found posts are displayed.
            </p>
          </div>
        ) : posts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={SearchX}
            title="No matching items found"
            description={
              nearMeActive
                ? `No active items found within the designated search range. Try re-centering the search or changing filters.`
                : 'Try clearing search keywords or selecting a different category filter.'
            }
            actionLabel={nearMeActive ? `Switch to Broad Scan (2km)` : `Reset All Filters`}
            onActionClick={() => {
              if (nearMeActive) {
                setRadiusKm(2.0);
              } else {
                setSelectedType('ALL');
                setSelectedCategory('All Categories');
                setSearchQuery('');
                updateUrlParams('ALL', 'All Categories', '');
              }
            }}
          />
        )}

        {viewMode === 'list' && hasMore && (
          <div className="mt-12 text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-xs inline-flex items-center gap-2"
            >
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
              <span>{loadingMore ? 'Loading...' : 'Load More Posts'}</span>
            </button>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>© 2026 FindMine. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
