import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

import { logger } from '@/lib/logger';

// Liveness/readiness probe for hosting platforms (Railway, Render, Fly.io, etc.)
// that need an HTTP endpoint to confirm the process is up and can reach the DB.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    logger.error('[Health Check] Database unreachable', { err });
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
