import { Readable } from 'node:stream';
import { contentDisposition } from '@/lib/security/filename';
import { safeResponseContentType, isInlineSafe, inferContentType } from '@/lib/security/mime';

/**
 * Builds a streaming Response for an attachment, without buffering it in
 * memory. `release` is invoked when the stream ends or the client aborts.
 *
 * `Content-Length` is only sent when the provider knows the exact number of
 * bytes it will stream (`meta.exactSize`). IMAP BODYSTRUCTURE sizes describe
 * the transfer-encoded part (base64 is ~33% larger than the decoded file), so
 * advertising them makes browsers abort the download as a network error.
 *
 * @param {{ meta: { filename: string, contentType: string, size?: number, exactSize?: number }, stream: import('stream').Readable, release: () => void }} attachment
 * @param {{ download?: boolean }} options
 */
export function attachmentResponse(attachment, { download = true } = {}) {
  const { meta, stream, release } = attachment;
  const declared = safeResponseContentType(meta.contentType);
  const inferred = download ? declared : inferContentType(declared, meta.filename);
  const inline = !download && isInlineSafe(inferred);
  const contentType = inline ? inferred : declared;

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
    // The previewer frames PDFs and text from this endpoint, so same-origin
    // framing is allowed; nothing else may embed an attachment. Browsers'
    // built-in PDF viewers are plugins and break under `default-src 'none'`.
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy':
      inline && contentType === 'application/pdf'
        ? "frame-ancestors 'self'"
        : "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-ancestors 'self'",
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (Number.isInteger(meta.exactSize) && meta.exactSize >= 0) {
    headers['Content-Length'] = String(meta.exactSize);
  }
  return new Response(body, { status: 200, headers });
}
