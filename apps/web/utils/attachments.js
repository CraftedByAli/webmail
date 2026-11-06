/**
 * Browser helpers for message attachments: preview classification, fetching
 * with readable errors, and saving files without leaving the app.
 */

const EXT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  eml: 'message/rfc822',
};

const TEXT_EXTENSIONS = new Set([
  'txt',
  'log',
  'md',
  'markdown',
  'json',
  'xml',
  'yml',
  'yaml',
  'ini',
  'conf',
  'cfg',
  'toml',
  'env',
  'ics',
  'vcf',
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'ts',
  'tsx',
  'jsx',
  'py',
  'rb',
  'php',
  'java',
  'c',
  'h',
  'cpp',
  'cs',
  'go',
  'rs',
  'sh',
  'sql',
  'diff',
  'patch',
  'srt',
  'vtt',
  'eml',
  'csv',
  'tsv',
]);

const GENERIC = new Set([
  '',
  'application/octet-stream',
  'application/x-download',
  'binary/octet-stream',
]);

export const MAX_PREVIEW_BYTES = 40 * 1024 * 1024;
export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

export function extensionOf(filename = '') {
  const i = filename.lastIndexOf('.');
  return i > 0 ? filename.slice(i + 1).toLowerCase() : '';
}

/** Best guess at the real type: senders often label everything octet-stream. */
export function effectiveType(attachment) {
  const declared = String(attachment?.contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (!GENERIC.has(declared)) return declared;
  return EXT_TYPES[extensionOf(attachment?.filename)] || declared || 'application/octet-stream';
}

/**
 * How an attachment can be previewed in the browser, or null.
 * @returns {'image'|'pdf'|'audio'|'video'|'csv'|'text'|null}
 */
export function previewKind(attachment) {
  if (!attachment) return null;
  const type = effectiveType(attachment);
  const ext = extensionOf(attachment.filename);
  const size = Number(attachment.size) || 0;

  if (/^image\/(png|jpeg|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon|svg\+xml)$/.test(type))
    return size <= MAX_PREVIEW_BYTES ? 'image' : null;
  if (type === 'application/pdf') return size <= MAX_PREVIEW_BYTES ? 'pdf' : null;
  if (/^audio\/(mpeg|mp3|mp4|ogg|wav|x-wav|webm|aac|flac)$/.test(type)) return 'audio';
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(type)) return 'video';
  if (type === 'text/csv' || type === 'text/tab-separated-values' || ext === 'csv' || ext === 'tsv')
    return size <= MAX_TEXT_PREVIEW_BYTES * 4 ? 'csv' : null;
  if (
    type.startsWith('text/') ||
    type === 'message/rfc822' ||
    /^application\/(json|xml|x-yaml|yaml|javascript|x-sh|sql|x-subrip)$/.test(type) ||
    type.endsWith('+json') ||
    type.endsWith('+xml') ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return size <= MAX_TEXT_PREVIEW_BYTES * 4 ? 'text' : null;
  }
  return null;
}

export function withParam(url, key, value) {
  const u = new URL(url, 'http://local');
  u.searchParams.set(key, value);
  return `${u.pathname}${u.search}`;
}

/** Download URL (forces Content-Disposition: attachment). */
export function downloadUrl(attachment) {
  return withParam(attachment.url, 'download', '1');
}

/** Inline URL (server serves allow-listed types inline, everything else downloads). */
export function inlineUrl(attachment) {
  return withParam(attachment.url, 'download', '0');
}

async function readError(response) {
  let message = '';
  try {
    const data = await response.json();
    message = data?.error?.message || '';
  } catch {
    // not JSON
  }
  if (response.status === 401) return 'Your session has expired. Sign in again.';
  if (response.status === 404) return message || 'This attachment is no longer available.';
  if (response.status === 429) return 'Too many requests. Wait a moment and try again.';
  return message || `The attachment could not be loaded (HTTP ${response.status}).`;
}

/**
 * Fetches an attachment as a Blob, retyped to what the browser needs to render
 * it (e.g. SVG served as octet-stream for safety is shown via <img>).
 * @param {object} attachment
 * @param {{ signal?: AbortSignal, download?: boolean, type?: string }} [options]
 */
export async function fetchAttachmentBlob(attachment, { signal, download = false, type } = {}) {
  let response;
  try {
    response = await fetch(download ? downloadUrl(attachment) : inlineUrl(attachment), {
      credentials: 'same-origin',
      signal,
      headers: { 'X-Requested-With': 'webmail' },
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('You appear to be offline. Check your connection and try again.');
  }
  if (!response.ok) throw new Error(await readError(response));
  const blob = await response.blob();
  const wanted = type || effectiveType(attachment);
  return wanted && blob.type !== wanted ? new Blob([blob], { type: wanted }) : blob;
}

/** Saves a Blob under a filename using a temporary object URL. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'attachment';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Downloads an attachment. Fetching first (instead of navigating) lets errors
 * surface as a message rather than a corrupt file in the downloads folder.
 */
export async function downloadAttachment(attachment, { signal } = {}) {
  const blob = await fetchAttachmentBlob(attachment, {
    signal,
    download: true,
    type: 'application/octet-stream',
  });
  saveBlob(blob, attachment.filename);
}

/** Minimal RFC 4180 CSV/TSV parser for previews (quoted fields, escaped quotes, CRLF). */
export function parseDelimited(text, delimiter = ',', maxRows = 500) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length >= maxRows) return { rows, truncated: i < text.length - 1 };
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows, truncated: false };
}
