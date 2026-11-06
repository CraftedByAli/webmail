/**
 * Formatting helpers for the UI (dates, sizes, names).
 */

const rtf =
  typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
    ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    : null;

/**
 * Gmail-style list date: time for today, "Mon DD" this year, otherwise date.
 * @param {string|Date|null} value
 * @param {{ timezone?: string, dateFormat?: string }} [prefs]
 */
export function formatListDate(value, prefs = {}) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tz = prefs.timezone && prefs.timezone !== 'auto' ? prefs.timezone : undefined;
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  try {
    if (sameDay)
      return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: tz,
      });
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: tz });
    }
    return date.toLocaleDateString(undefined, dateFormatOptions(prefs.dateFormat, tz));
  } catch {
    return date.toLocaleDateString();
  }
}

/** Full date for the message header. */
export function formatFullDate(value, prefs = {}) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tz = prefs.timezone && prefs.timezone !== 'auto' ? prefs.timezone : undefined;
  try {
    return date.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    });
  } catch {
    return date.toLocaleString();
  }
}

/** "3 hours ago" style. */
export function formatRelative(value) {
  if (!value || !rtf) return formatListDate(value);
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatListDate(value);
}

function dateFormatOptions(format, tz) {
  const base = { timeZone: tz };
  if (format === 'ymd') return { ...base, year: 'numeric', month: '2-digit', day: '2-digit' };
  return { ...base, year: 'numeric', month: 'short', day: 'numeric' };
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/**
 * Short participant label for list rows (first names, "me").
 *
 * The message count is rendered separately by the row so it can carry its own
 * typographic weight; it is deliberately not baked into this string.
 */
export function participantsLabel(participants, me) {
  if (!participants || participants.length === 0) return me ? 'me' : '';
  const names = participants.map((p) => {
    if (me && p.address === me) return 'me';
    const name = p.name || p.address.split('@')[0];
    return name.split(/\s+/)[0];
  });
  const unique = [...new Set(names)];
  return unique.length > 3
    ? `${unique.slice(0, 2).join(', ')} … ${unique[unique.length - 1]}`
    : unique.join(', ');
}

/** Deterministic avatar hue from an email address. */
export function avatarColor(address) {
  let h = 0;
  for (const ch of address || '') h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

export function initialsOf(address) {
  const label = (address?.name || address?.address?.split('@')[0] || '?').replace(/[<>"]/g, '');
  const parts = label.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
