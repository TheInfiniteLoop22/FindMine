'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';

import { getErrorMessage } from '@/lib/errors';
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB, matches the server-side limit in /api/upload

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  required?: boolean;
  helperText?: string;
  error?: string | null;
  shape?: 'square' | 'circle';
  disabled?: boolean;
}

/**
 * Single-file "upload from device" control backed by POST /api/upload.
 * Replaces every ad-hoc "paste an image URL" text input in the app —
 * the user never has to hand-type a URL, and never sees a broken image
 * from a dead/unreachable link.
 */
export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  value,
  onChange,
  label,
  required = false,
  helperText,
  error,
  shape = 'square',
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError('Image is too large. Maximum size is 8MB.');
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to upload image');
      }

      const url = json.data?.url || json.url;
      if (!url) {
        throw new Error('Upload returned no URL');
      }

      onChange(url);
    } catch (err: unknown) {
      console.error('Image upload error:', err);
      setUploadError(getErrorMessage(err, 'Could not upload image. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const previewShapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <div>
      {label && (
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        disabled={disabled || uploading}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        <div
          className={`relative w-20 h-20 shrink-0 overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center ${previewShapeClass}`}
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          ) : value ? (
            <Image src={value} alt="Uploaded preview" fill sizes="80px" className="object-cover" />
          ) : (
            <ImageIcon className="w-6 h-6 text-slate-300" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-200/60 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Uploading...' : value ? 'Change Photo' : 'Upload Photo'}</span>
          </button>

          {value && !uploading && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              aria-label="Remove photo"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {helperText && !uploadError && !error && (
        <p className="mt-1.5 text-[10px] text-slate-400">{helperText}</p>
      )}
      {(uploadError || error) && (
        <p className="mt-1.5 text-[10px] text-rose-500 font-medium">{uploadError || error}</p>
      )}
    </div>
  );
};

export default ImageUploadField;
