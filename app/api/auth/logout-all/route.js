import { NextResponse } from 'next/server';
import { createHandler } from '@/lib/api/handler';
import { revokeAllSessions } from '@/lib/auth/session';
import { serializeClearedSessionCookie } from '@/lib/auth/cookies';
import { connectionManager } from '@/lib/imap/connection-manager';
import { invalidateUserCache } from '@/lib/cache/mail-cache';
import { logger } from '@/lib/logger';

/** POST /api/auth/logout-all — revokes every session for the mailbox. */
export const POST = createHandler(async ({ session }) => {
  const count = revokeAllSessions(session.email);
  await connectionManager.closeForUser(session.email);
  invalidateUserCache(session.email);
  logger.info(
    { operation: 'auth.logoutAll', mailbox: session.email, count },
    'all sessions revoked'
  );
  const response = NextResponse.json({ ok: true, revoked: count });
  response.headers.append('Set-Cookie', serializeClearedSessionCookie());
  return response;
});
