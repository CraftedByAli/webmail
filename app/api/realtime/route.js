import { readSessionToken } from '@/lib/auth/cookies';
import { resolveSession } from '@/lib/auth/session';
import { realtimeHub } from '@/lib/realtime/hub';
import { idleManager } from '@/lib/imap/idle-manager';
import { getConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/realtime — Server-Sent Events stream of mailbox changes.
 *
 * Each browser tab holds one SSE connection; all tabs of a mailbox share a
 * single server-side IMAP IDLE connection managed by {@link idleManager}.
 * Clients fall back to polling if the stream cannot be established.
 */
export async function GET(request) {
  const session = resolveSession(readSessionToken(request));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let releaseIdle = () => {};
  let heartbeat = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        releaseIdle();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      controller.enqueue(
        encoder.encode(
          `retry: 5000\nevent: ready\ndata: ${JSON.stringify({ type: 'ready', at: Date.now() })}\n\n`
        )
      );
      unsubscribe = realtimeHub.subscribe(session.email, send);
      if (getConfig().provider !== 'mock') {
        releaseIdle = idleManager.retain(session.credentials);
      }
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 25_000);

      request.signal?.addEventListener('abort', cleanup);
      logger.debug(
        { operation: 'realtime.subscribe', mailbox: session.email },
        'sse client connected'
      );
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      releaseIdle();
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
