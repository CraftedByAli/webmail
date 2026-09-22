import { NextResponse } from 'next/server';
import { createHandler } from '@/lib/api/handler';
import { revokeSession } from '@/lib/auth/session';
import { serializeClearedSessionCookie } from '@/lib/auth/cookies';
import { logger } from '@/lib/logger';

/** POST /api/auth/logout — ends the current session. */
export const POST = createHandler(async ({ session }) => {
  revokeSession(session.id, session.email);
  logger.info(
    { operation: 'auth.logout', mailbox: session.email, sessionId: session.id },
    'logged out'
  );
  const response = NextResponse.json({ ok: true });
  response.headers.append('Set-Cookie', serializeClearedSessionCookie());
  return response;
});
