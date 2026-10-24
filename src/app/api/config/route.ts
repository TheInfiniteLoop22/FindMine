import { NextResponse } from 'next/server';

// Exposes a handful of feature flags that the client needs but can't reliably
// read via NEXT_PUBLIC_* build-time inlining on this deployment: Render's
// Docker builds don't forward dashboard env vars as build args unless the
// Dockerfile explicitly declares a matching ARG, and a missed one (or a
// dashboard value changed after the last image build) silently bakes in as
// `undefined` with no error anywhere - see the Dockerfile's NEXT_PUBLIC_*
// ARG block for the history here. Reading it at request time instead makes
// this correct regardless of the build pipeline.
export async function GET() {
  return NextResponse.json({
    data: {
      demoLoginEnabled: process.env.ENABLE_DEMO_LOGIN === 'true',
    },
  });
}
