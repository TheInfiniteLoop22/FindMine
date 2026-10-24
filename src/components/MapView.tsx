'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PostItem } from '@/data/posts';
import { MapPin, Tag, User as UserIcon, ArrowUpRight } from 'lucide-react';

// Fix Leaflet marker icon asset paths for Next.js
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Lost (Red) and Found (Green) Map Markers
const createCustomIcon = (type: 'LOST' | 'FOUND') => {
  const color = type === 'LOST' ? '#f43f5e' : '#10b981';
  const label = type === 'LOST' ? 'L' : 'F';
  
  return L.divIcon({
    className: 'custom-map-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        border: 2px solid white;
      ">
        <span style="
          transform: rotate(45deg);
          color: white;
          font-weight: 900;
          font-size: 13px;
          font-family: sans-serif;
        ">${label}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

// Scan Center Red Draggable pin
const createCenterIcon = () => {
  return L.divIcon({
    className: 'scan-center-marker',
    html: `
      <div style="
        background-color: #4f46e5;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        border: 3px solid white;
      ">
        <div style="width: 10px; height: 10px; background-color: white; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
};

const LocationPickerMarker: React.FC<{
  position: [number, number] | null;
  onPositionChange: (lat: number, lng: number) => void;
  isDraggable?: boolean;
}> = ({ position, onPositionChange, isDraggable = true }) => {
  const map = useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);

  return position ? (
    <Marker
      position={position}
      icon={createCenterIcon()}
      draggable={isDraggable}
      eventHandlers={{
        dragend(e) {
          const marker = e.target;
          const pos = marker.getLatLng();
          onPositionChange(pos.lat, pos.lng);
        },
      }}
    >
      <Popup>
        <div className="text-center p-1">
          <span className="text-[10px] font-bold text-slate-500 block uppercase">Search Center Pinned</span>
          <p className="text-[9px] text-slate-400">Drag this pin to scan a different area</p>
        </div>
      </Popup>
    </Marker>
  ) : null;
};

// Component to dynamically pan/zoom map on external center changes
const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

interface MapViewProps {
  posts?: PostItem[];
  interactivePin?: boolean;
  selectedPos?: [number, number] | null;
  onSelectPos?: (lat: number, lng: number) => void;
  center?: [number, number];
  zoom?: number;
  height?: string;
}

export const MapView: React.FC<MapViewProps> = ({
  posts = [],
  // Accepted for backward compatibility with existing callers, but the
  // click-to-select behavior below is already gated purely on whether
  // `onSelectPos` is provided - this flag has never actually been read.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interactivePin = false,
  selectedPos = null,
  onSelectPos,
  // Last-resort default when a caller has neither a real geolocation fix (see
  // useCurrentLocation) nor a stored position to show — the single fallback
  // coordinate for the whole app now, instead of each screen hardcoding its own.
  center = [20.5937, 78.9629],
  zoom = 5,
  height = '500px',
}) => {
  // Only display pins for posts with status OPEN and type LOST or FOUND (Strict exclusion of MATCHED/CLOSED)
  const activePosts = posts.filter(
    (p) => p.lat != null && p.lng != null && p.status === 'OPEN' && (p.type === 'LOST' || p.type === 'FOUND')
  );

  const mapCenter: [number, number] = selectedPos ? selectedPos : center;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-slate-100 z-0">
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height, width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController center={mapCenter} zoom={zoom} />

        {/* Search center pin - allows click / drag */}
        {onSelectPos && (
          <LocationPickerMarker position={selectedPos} onPositionChange={onSelectPos} isDraggable={true} />
        )}

        {/* Map Feed Pins */}
        {activePosts.map((post) => {
          const isLost = post.type === 'LOST';
          const imgUrl =
            post.images?.find((i) => i.isPrimary)?.url || post.images?.[0]?.url || post.imageUrl;

          // Prefer the server-computed PostGIS distance (relative to the current scan center) when
          // available; only fall back to a client-side Haversine estimate if the API didn't provide one.
          let distanceLabel = '';
          if (typeof post.distance_km === 'number') {
            const d = post.distance_km;
            distanceLabel = d < 1 ? `${Math.round(d * 1000)}m away` : `${d.toFixed(1)}km away`;
          } else if (selectedPos) {
            const lat1 = selectedPos[0];
            const lon1 = selectedPos[1];
            const lat2 = post.lat!;
            const lon2 = post.lng!;

            // Simple Haversine calculation to get distance
            const R = 6371; // km
            const dLat = ((lat2 - lat1) * Math.PI) / 180;
            const dLon = ((lon2 - lon1) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const d = R * c;

            distanceLabel = d < 1 ? `${Math.round(d * 1000)}m away` : `${d.toFixed(1)}km away`;
          }

          return (
            <Marker
              key={post.id}
              position={[post.lat!, post.lng!]}
              icon={createCustomIcon(post.type)}
            >
              <Popup className="custom-leaflet-popup" minWidth={240}>
                <div className="w-60 -m-1">
                  <div className="relative h-32 rounded-t-lg overflow-hidden bg-slate-100 -mx-1 -mt-1">
                    <Image
                      src={imgUrl}
                      alt={post.title}
                      fill
                      sizes="240px"
                      className="object-cover"
                    />
                    <span
                      className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase shadow-xs ${
                        isLost ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                    >
                      {post.type}
                    </span>
                    {distanceLabel && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-slate-900/70 backdrop-blur-sm">
                        {distanceLabel}
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 space-y-1.5">
                    <h4 className="font-bold text-sm text-slate-900 leading-snug line-clamp-2">
                      {post.title}
                    </h4>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{post.category}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{post.locationText}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">Posted by {post.userDisplayName || 'Community Member'}</span>
                    </div>

                    <Link
                      href={`/posts/${post.id}`}
                      className="mt-2 w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold shadow-xs inline-flex items-center justify-center gap-1"
                    >
                      <span>View Full Post</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapView;
