import { NextResponse } from 'next/server';
import { createHandler } from '@/lib/api/handler';
import { revokeSessionEntirely, isMailboxSignedInAnywhere } from '@/lib/auth/session';
import { serializeClearedSessionCookie } from '@/lib/auth/cookies';
import { connectionManager } from '@/lib/imap/connection-manager';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/logout — signs this browser out of every mailbox it holds.
 * (Signing out of a single mailbox is DELETE /api/auth/accounts.)
 */
export const POST = createHandler(
  async ({ session }) => {
    const emails = session.accounts.map((a) => a.email);
    revokeSessionEntirely(session.id);
    for (const email of emails) {
      if (!isMailboxSignedInAnywhere(email)) connectionManager.closeForUser(email).catch(() => {});
    }
    logger.info(
      { operation: 'auth.logout', mailboxes: emails, sessionId: session.id },
      'logged out'
    );
    const response = NextResponse.json({ ok: true });
    response.headers.append('Set-Cookie', serializeClearedSessionCookie());
    return response;
  },
  { allowMissingAccount: true }
);
