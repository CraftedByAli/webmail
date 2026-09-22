import { convert } from 'html-to-text';

/**
 * Turns a partial, still transfer-encoded body fragment into a short plain
 * text preview for the message list.
 *
 * @param {Buffer} raw
 * @param {{ encoding?: string, charset?: string, type?: string }} info
 * @param {number} [maxLength]
 */
export function decodePreview(raw, info = {}, maxLength = 160) {
  if (!raw || raw.length === 0) return '';
  const encoding = (info.encoding || '7bit').toLowerCase();
  let text;
  try {
    let bytes = raw;
    if (encoding === 'base64') {
      // Drop a trailing partial quantum so the truncated fragment still decodes.
      const clean = raw.toString('ascii').replace(/[^A-Za-z0-9+/=]/g, '');
      bytes = Buffer.from(clean.slice(0, clean.length - (clean.length % 4)), 'base64');
    } else if (encoding === 'quoted-printable') {
      bytes = decodeQuotedPrintable(raw.toString('ascii'));
    }
    text = decodeCharset(bytes, info.charset);
  } catch {
    text = raw.toString('utf8');
  }

  if ((info.type || '').toLowerCase() === 'text/html') {
    text = htmlToPreviewText(text);
  }

  text = text
    .replace(/^>.*$/gm, '') // quoted lines
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLength) text = `${text.slice(0, maxLength).trim()}…`;
  return text;
}

function decodeQuotedPrintable(str) {
  // A truncated fragment may end mid-escape; drop the dangling "=" or "=X".
  const trimmed = str.replace(/=\r?\n/g, '').replace(/=[0-9A-Fa-f]?$/, '');
  const out = [];
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(trimmed.slice(i + 1, i + 3))) {
      out.push(parseInt(trimmed.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return Buffer.from(out);
}

function decodeCharset(bytes, charset) {
  const cs = (charset || 'utf-8').toLowerCase().replace(/[^a-z0-9-]/g, '');
  try {
    return new TextDecoder(cs || 'utf-8', { fatal: false }).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

/** Converts (possibly truncated) HTML to plain text for previews. */
export function htmlToPreviewText(html) {
  try {
    // A truncated HTML fragment may still contain an open <style>/<head>.
    const stripped = html
      .replace(/<style[\s\S]*?(<\/style>|$)/gi, '')
      .replace(/<script[\s\S]*?(<\/script>|$)/gi, '');
    return convert(stripped, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'h1', options: { uppercase: false } },
        { selector: 'h2', options: { uppercase: false } },
        { selector: 'h3', options: { uppercase: false } },
        { selector: 'table', format: 'block' },
      ],
    });
  } catch {
    return html.replace(/<[^>]+>/g, ' ');
  }
}
