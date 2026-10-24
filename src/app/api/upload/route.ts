import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function uploadToCloudinary(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload returned no result'));
          return;
        }
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to upload images.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Rate Limiting Audit (10 uploads per minute per user)
    const limitResult = rateLimit(`upload:${session.user.id}`, 10, 60000);
    if (!limitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a minute before uploading more images.', code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided in request.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a JPEG, PNG, WEBP, or GIF image.', code: 'INVALID_FILE_TYPE' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Image is too large. Maximum size is 8MB.', code: 'FILE_TOO_LARGE' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadToCloudinary(buffer, `findmine/${session.user.id}`);

    return NextResponse.json({ data: { url: result.secure_url } });
  } catch (error: unknown) {
    logger.error('Upload handler error', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to upload image'), code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
