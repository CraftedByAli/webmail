import { NextResponse } from 'next/server';
import { createHandler, json } from '@/lib/api/handler';
import { revokeAllSessions, listSessionAccounts } from '@/lib/auth/session';
import { serializeClearedSessionCookie } from '@/lib/auth/cookies';
import { connectionManager } from '@/lib/imap/connection-manager';
import { invalidateUserCache } from '@/lib/cache/mail-cache';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/logout-all — signs the current mailbox out of every device
 * ("sign out everywhere"). Other mailboxes signed in on this browser stay
 * signed in; if none is left the session cookie is cleared.
 */
export const POST = createHandler(async ({ session }) => {
  const count = revokeAllSessions(session.email);
  await connectionManager.closeForUser(session.email);
  invalidateUserCache(session.email);
  logger.info(
    { operation: 'auth.logoutAll', mailbox: session.email, count },
    'all sessions revoked'
  );
  const remaining = listSessionAccounts(session.id);
  if (remaining.length > 0) {
    return json({ ok: true, revoked: count, signedOut: false, next: remaining[0].email });
  }
  const response = NextResponse.json({ ok: true, revoked: count, signedOut: true });
  response.headers.append('Set-Cookie', serializeClearedSessionCookie());
  return response;
});
