/**
 * Post-sanitization analysis of email HTML.
 *
 * Two questions decide how a message is presented, and both are answered on
 * the server so the client never has to parse untrusted markup:
 *
 *  1. Does the message bring its own visual design?
 *     Newsletters and transactional templates ship a full layout with their own
 *     colours. Recolouring those produces broken, half-inverted results, so we
 *     render them as the sender intended on a light sheet — even in dark mode.
 *     Ordinary person-to-person mail carries no design, so we render it in the
 *     reader's own theme, which is what makes dark mode actually work.
 *
 *  2. Where does the quoted reply chain begin?
 *     Splitting it off lets the reader see the new content first and expand the
 *     history on demand, which is the difference between a readable thread and
 *     a wall of nested quotes.
 */

/** Markers that reliably indicate the start of quoted history. */
const QUOTE_MARKERS = [
  /<div[^>]+class="[^"]*gmail_quote[^"]*"/i,
  /<div[^>]+class="[^"]*moz-cite-prefix[^"]*"/i,
  /<div[^>]+class="[^"]*yahoo_quoted[^"]*"/i,
  /<blockquote[^>]+type="cite"/i,
  /<div[^>]+class="[^"]*wm-quote[^"]*"/i,
  /-{3,}\s*(original message|forwarded message)\s*-{3,}/i,
];

const MIN_MAIN_TEXT = 24;

/**
 * Splits a message body into the new content and the quoted history.
 * @param {string} html sanitized HTML
 * @returns {{ main: string, quoted: string | null }}
 */
export function splitQuotedContent(html) {
  if (!html) return { main: '', quoted: null };

  let cut = -1;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(html);
    if (!match) continue;
    if (cut === -1 || match.index < cut) cut = match.index;
  }

  // A trailing blockquote that makes up the tail of the message is also history.
  if (cut === -1) {
    const index = html.search(/<blockquote[\s>]/i);
    if (index > -1 && index > html.length * 0.35) cut = index;
  }

  if (cut === -1) return { main: html, quoted: null };

  const main = html.slice(0, cut);
  const quoted = html.slice(cut);

  // Only split when something meaningful is left above the fold; otherwise the
  // reader would open a message that looks empty.
  if (textLength(main) < MIN_MAIN_TEXT) return { main: html, quoted: null };
  if (textLength(quoted) < MIN_MAIN_TEXT) return { main: html, quoted: null };

  return { main, quoted };
}

/**
 * Decides whether the message supplies its own presentation.
 * @param {string} html sanitized HTML
 * @returns {'sender'|'app'}
 */
export function classifyPresentation(html) {
  if (!html) return 'app';

  if (/<[a-z]+[^>]*\sbgcolor\s*=/i.test(html)) return 'sender';
  if (/background(-color)?\s*:\s*(?!transparent|inherit|none|initial)[^;"']+/i.test(html))
    return 'sender';

  // Classic email layout tables: several cells plus an explicit pixel width.
  const cells = (html.match(/<t[dh][\s>]/gi) || []).length;
  if (cells >= 4 && /<table[^>]+width\s*=\s*["']?\d{3}/i.test(html)) return 'sender';
  if (cells >= 12) return 'sender';

  return 'app';
}

function textLength(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}
