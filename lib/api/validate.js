import { errors } from '@/lib/api/errors';
import { isValidEmail } from '@/lib/mime/address';

/** Small, dependency-free validators for route inputs. */

export function str(value, { name = 'value', max = 1000, required = false, pattern } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.badRequest(`${name} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw errors.badRequest(`${name} must be text.`);
  if (value.length > max) throw errors.badRequest(`${name} is too long.`);
  if (pattern && !pattern.test(value)) throw errors.badRequest(`${name} is invalid.`);
  return value;
}

export function int(
  value,
  { name = 'value', min = 0, max = Number.MAX_SAFE_INTEGER, fallback } = {}
) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw errors.badRequest(`${name} is required.`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw errors.badRequest(`${name} is invalid.`);
  return n;
}

/** IMAP folder path: printable, no control chars, bounded length. */
export function folderPath(value, { required = true } = {}) {
  const v = str(value, { name: 'folder', max: 255, required });

  if (v && /[\x00-\x1f\x7f]/.test(v)) throw errors.badRequest('Folder name is invalid.');
  return v;
}

/** New folder name typed by the user (no path separators or wildcards). */
export function folderName(value) {
  const v = str(value, { name: 'name', max: 100, required: true }).trim();
  if (!v || /[\\%*"\x00-\x1f\x7f]/.test(v))
    throw errors.badRequest('Folder name contains invalid characters.');
  return v;
}

export function uidList(value, { max = 500 } = {}) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const uids = list.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  if (uids.length === 0) throw errors.badRequest('No messages selected.');
  if (uids.length > max) throw errors.badRequest(`Select at most ${max} messages at a time.`);
  return [...new Set(uids)];
}

export function addressList(value, { name = 'recipients', max = 100 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw errors.badRequest(`${name} must be a list.`);
  if (value.length > max) throw errors.badRequest(`Too many ${name}.`);
  return value.map((item) => {
    const address = String(typeof item === 'string' ? item : item?.address || '')
      .trim()
      .toLowerCase();
    if (!isValidEmail(address))
      throw errors.badRequest(`"${address.slice(0, 80)}" is not a valid email address.`);
    return {
      name: String(typeof item === 'string' ? '' : item?.name || '').slice(0, 200),
      address,
    };
  });
}

export function bool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}
