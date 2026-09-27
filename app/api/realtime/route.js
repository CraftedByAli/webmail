import { readAccountHint, readSessionToken } from '@/lib/auth/cookies';
import { getAllSessionCredentials, listSessionAccounts, resolveSession } from '@/lib/auth/session';
import { invalidateAccountStatus } from '@/lib/auth/accounts';
import { realtimeHub } from '@/lib/realtime/hub';
import { idleManager } from '@/lib/imap/idle-manager';
import { getConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/realtime — Server-Sent Events stream of mailbox changes for every
 * mailbox signed in to this browser session.
 *
 * Each event carries `account` (the mailbox it belongs to) so the client can
 * update exactly that mailbox's cache and never another's. Each browser tab
 * holds one SSE connection; all tabs of a mailbox share a single server-side
 * IMAP IDLE connection managed by {@link idleManager}. The heartbeat also
 * re-checks the session so a mailbox signed out elsewhere stops streaming.
 */
export async function GET(request) {
  const session = resolveSession(readSessionToken(request), {
    preferred: readAccountHint(request),
  });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const credentials = getAllSessionCredentials(session);
  const emails = credentials.map((c) => c.user);
  const fingerprint = emails.join(',');
  const encoder = new TextEncoder();
  const cleanups = [];
  let heartbeat = null;
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const write = (type, payload) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        for (const fn of cleanups.splice(0)) {
          try {
            fn();
          } catch {
            // ignore
          }
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      controller.enqueue(encoder.encode('retry: 5000\n\n'));
      write('ready', { type: 'ready', at: Date.now(), accounts: emails });

      for (const cred of credentials) {
        const account = cred.user;
        cleanups.push(
          realtimeHub.subscribe(account, (event) => {
            if (event.type === 'new_mail' || event.type === 'expunge' || event.type === 'flags')
              invalidateAccountStatus(account);
            write(event.type, { ...event, account });
          })
        );
        if (getConfig().provider !== 'mock') cleanups.push(idleManager.retain(cred));
      }

      heartbeat = setInterval(() => {
        if (closed) return;
        const current = listSessionAccounts(session.id).map((a) => a.email);
        if (current.length === 0) {
          write('session_ended', { type: 'session_ended' });
          cleanup();
          return;
        }
        if (current.join(',') !== fingerprint) {
          write('accounts_changed', { type: 'accounts_changed', accounts: current });
          cleanup();
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      request.signal?.addEventListener('abort', () => cleanup());
      logger.debug(
        { operation: 'realtime.subscribe', mailboxes: emails, sessionId: session.id },
        'sse client connected'
      );
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
