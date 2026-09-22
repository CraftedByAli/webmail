import { fileTypeFromBuffer } from 'file-type';

/**
 * Content-type validation for uploads and downloads. The client-supplied MIME
 * type is never trusted: it is only used as a hint when magic-byte detection
 * cannot identify the file (e.g. plain text).
 */

/** Types that browsers may render inline; everything else is forced to download. */
const INLINE_SAFE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'text/plain',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/mp4',
  'video/webm',
]);

/** Extensions we refuse to accept as uploads regardless of detected type. */
const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'scr',
  'bat',
  'cmd',
  'com',
  'pif',
  'msi',
  'msp',
  'jar',
  'js',
  'jse',
  'vbs',
  'vbe',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  'reg',
  'hta',
  'cpl',
  'lnk',
  'dll',
  'sys',
  'app',
  'dmg',
]);

const GENERIC = 'application/octet-stream';

/**
 * Detects a content type from bytes. Falls back to the declared type only if
 * it is a benign text/document type.
 * @param {Buffer} buffer
 * @param {string} [declared]
 */
export async function detectContentType(buffer, declared) {
  try {
    const detected = await fileTypeFromBuffer(buffer.subarray(0, 4100));
    if (detected?.mime) return detected.mime;
  } catch {
    // fall through
  }
  const d = (declared || '').toLowerCase().split(';')[0].trim();
  if (/^text\/(plain|csv|markdown|calendar|vcard)$/.test(d)) return d;
  if (d === 'application/json' || d === 'message/rfc822') return d;
  if (isProbablyText(buffer)) return 'text/plain';
  return GENERIC;
}

function isProbablyText(buffer) {
  const sample = buffer.subarray(0, 512);
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127) || byte >= 128)
      printable += 1;
  }
  return sample.length > 0 && printable / sample.length > 0.95;
}

/** Whether the file may be previewed inline in the browser. */
export function isInlineSafe(contentType) {
  return INLINE_SAFE.has((contentType || '').toLowerCase().split(';')[0].trim());
}

/** Normalises a content type for response headers; unknown types download. */
export function safeResponseContentType(contentType) {
  const type = (contentType || '').toLowerCase().split(';')[0].trim();
  if (
    !type ||
    type.includes('html') ||
    type.includes('xml') ||
    type.includes('svg') ||
    type.includes('javascript')
  ) {
    return GENERIC;
  }
  return type;
}

export function isBlockedExtension(filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  return BLOCKED_EXTENSIONS.has(ext);
}
