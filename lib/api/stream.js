import { Readable } from 'node:stream';
import { contentDisposition } from '@/lib/security/filename';
import { safeResponseContentType, isInlineSafe } from '@/lib/security/mime';

/**
 * Builds a streaming Response for an attachment, without buffering it in
 * memory. `release` is invoked when the stream ends or the client aborts.
 *
 * @param {{ meta: { filename: string, contentType: string, size?: number }, stream: import('stream').Readable, release: () => void }} attachment
 * @param {{ download?: boolean }} options
 */
export function attachmentResponse(attachment, { download = true } = {}) {
  const { meta, stream, release } = attachment;
  const contentType = safeResponseContentType(meta.contentType);
  const inline = !download && isInlineSafe(contentType);

  let released = false;
  const done = () => {
    if (released) return;
    released = true;
    try {
      release();
    } catch {
      // ignore
    }
  };
  stream.once('end', done);
  stream.once('error', done);
  stream.once('close', done);

  const web = Readable.toWeb(stream);
  const body = new ReadableStream({
    start(controller) {
      const reader = web.getReader();
      const pump = () =>
        reader
          .read()
          .then(({ done: finished, value }) => {
            if (finished) {
              controller.close();
              done();
              return;
            }
            controller.enqueue(value);
            return pump();
          })
          .catch((error) => {
            controller.error(error);
            done();
          });
      return pump();
    },
    cancel() {
      stream.destroy();
      done();
    },
  });

  const headers = {
    'Content-Type': inline
      ? contentType
      : contentType === 'text/plain'
        ? 'text/plain; charset=utf-8'
        : contentType,
    'Content-Disposition': contentDisposition(meta.filename, inline ? 'inline' : 'attachment'),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  };
  if (meta.size) headers['Content-Length'] = String(meta.size);
  return new Response(body, { status: 200, headers });
}
