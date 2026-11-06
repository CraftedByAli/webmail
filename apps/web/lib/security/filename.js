import path from 'node:path';

/**
 * Produces a filesystem-safe and header-safe filename from untrusted input.
 * Prevents path traversal, control characters and absurd lengths.
 * @param {string} name
 * @param {string} [fallback]
 */
export function sanitizeFilename(name, fallback = 'attachment') {
  if (!name || typeof name !== 'string') return fallback;
  let base = path.basename(name.replace(/\\/g, '/'));

  base = base
    .replace(/[\x00-\x1f\x7f"<>:|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!base || base === '.' || base === '..') return fallback;
  if (base.length > 180) {
    const ext = path.extname(base).slice(0, 20);
    base = base.slice(0, 180 - ext.length) + ext;
  }
  return base;
}

/**
 * Builds an RFC 6266 Content-Disposition header that works for non-ASCII
 * names across browsers.
 * @param {string} filename
 * @param {'attachment'|'inline'} type
 */
export function contentDisposition(filename, type = 'attachment') {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
