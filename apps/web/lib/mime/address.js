/**
 * Address helpers shared by the IMAP layer, the SMTP layer and the UI model.
 *
 * @typedef {Object} Address
 * @property {string} name
 * @property {string} address
 */

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/** Validates a bare email address. */
export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());
}

/**
 * Normalises an imapflow / mailparser address object into {@link Address}.
 * @param {any} input
 * @returns {Address | null}
 */
export function normalizeAddress(input) {
  if (!input) return null;
  if (typeof input === 'string') return parseAddress(input);
  const address = String(input.address || '')
    .trim()
    .toLowerCase();
  const name = String(input.name || '').trim();
  if (!address && !name) return null;
  return { name, address };
}

/**
 * @param {any[] | undefined} list
 * @returns {Address[]}
 */
export function normalizeAddressList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeAddress).filter(Boolean);
}

/**
 * Parses `"Name" <email>` or `email` into an Address.
 * @param {string} text
 * @returns {Address | null}
 */
export function parseAddress(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const match = trimmed.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (match) {
    const address = match[2].trim().toLowerCase();
    return isValidEmail(address) ? { name: match[1].trim(), address } : null;
  }
  const lower = trimmed.toLowerCase();
  return isValidEmail(lower) ? { name: '', address: lower } : null;
}

/**
 * Parses a comma/semicolon separated recipient string.
 * @param {string} text
 * @returns {Address[]}
 */
export function parseAddressList(text) {
  if (!text) return [];
  const results = [];
  let current = '';
  let inQuotes = false;
  let inAngle = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === '<') inAngle = true;
    if (ch === '>') inAngle = false;
    if ((ch === ',' || ch === ';') && !inQuotes && !inAngle) {
      const parsed = parseAddress(current);
      if (parsed) results.push(parsed);
      current = '';
      continue;
    }
    current += ch;
  }
  const parsed = parseAddress(current);
  if (parsed) results.push(parsed);
  return results;
}

/**
 * Formats an Address for an RFC 5322 header.
 * @param {Address} address
 */
export function formatAddress(address) {
  if (!address) return '';
  if (!address.name) return address.address;
  const needsQuotes = /[^A-Za-z0-9 ._'-]/.test(address.name);
  const name = needsQuotes ? `"${address.name.replace(/(["\\])/g, '\\$1')}"` : address.name;
  return `${name} <${address.address}>`;
}

/** Display label: name if present, otherwise the address. */
export function displayName(address) {
  if (!address) return '';
  return address.name || address.address;
}

/** Initials for avatars. */
export function initials(address) {
  const label = (address?.name || address?.address?.split('@')[0] || '?').replace(/[<>"]/g, '');
  const parts = label.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deduplicates a list of addresses, case-insensitively. */
export function dedupeAddresses(list, exclude = []) {
  const seen = new Set(exclude.map((a) => (typeof a === 'string' ? a : a.address).toLowerCase()));
  const out = [];
  for (const a of list) {
    if (!a || !a.address) continue;
    const key = a.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
