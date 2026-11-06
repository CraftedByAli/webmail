import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/health — liveness. Never touches external dependencies. */
export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
