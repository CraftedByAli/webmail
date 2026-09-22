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
 * Background values that carry no design intent.
 *
 * White is the one that matters. Outlook and Word stamp `background-color:
 * #ffffff` (and `bgcolor="#FFFFFF"`) onto ordinary replies, so treating any
 * background at all as "the sender designed this" sent plain correspondence
 * down the light-sheet path — a glaring white block in the middle of dark mode,
 * for mail that has no design to preserve.
 */
const NEUTRAL_BACKGROUND =
  /^(?:transparent|inherit|initial|unset|revert|none|auto|currentcolor|white|#fff|#ffffff|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,[^)]*)?\))$/i;

/** A background on a run of text is a highlight, not a layout. */
const INLINE_TEXT_TAGS = new Set([
  'a',
  'b',
  'i',
  'u',
  's',
  'em',
  'strong',
  'span',
  'mark',
  'font',
  'small',
  'sub',
  'sup',
  'code',
  'tt',
  'big',
  'abbr',
  'label',
]);

/** Below this an explicit table width is a stray attribute, not a template shell. */
const TEMPLATE_WIDTH_PX = 300;

/**
 * Decides whether the message supplies its own presentation.
 * @param {string} html sanitized HTML
 * @returns {'sender'|'app'}
 */
export function classifyPresentation(html) {
  if (!html) return 'app';

  if (hasDesignedBackground(html)) return 'sender';

  // A table handed an explicit pixel width is the classic email-template shell;
  // no mail client produces one for something a person simply typed.
  if (hasFixedWidthTable(html)) return 'sender';

  // Dense table layout, even without a declared width.
  if ((html.match(/<t[dh][\s>]/gi) || []).length >= 12) return 'sender';

  return 'app';
}

/** True if some block-level element paints a background of its own. */
function hasDesignedBackground(html) {
  const tag = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let match;
  while ((match = tag.exec(html)) !== null) {
    const [, name, attributes] = match;
    if (INLINE_TEXT_TAGS.has(name.toLowerCase())) continue;

    const bgcolor = /\sbgcolor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
    if (bgcolor && !isNeutralBackground(bgcolor[1] ?? bgcolor[2] ?? bgcolor[3])) return true;

    const style = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    if (!style) continue;
    for (const declaration of (style[1] ?? style[2] ?? '').split(';')) {
      const background = /^\s*background(?:-color)?\s*:\s*(.+)$/i.exec(declaration);
      if (background && !isNeutralBackground(background[1])) return true;
    }
  }
  return false;
}

function isNeutralBackground(value) {
  return NEUTRAL_BACKGROUND.test(
    String(value)
      .replace(/!\s*important/i, '')
      .trim()
  );
}

/** True if a table declares a template-sized pixel width, via attribute or style. */
function hasFixedWidthTable(html) {
  const table = /<table\b([^>]*)>/gi;
  let match;
  while ((match = table.exec(html)) !== null) {
    const attributes = match[1];
    const widthAttr = /\swidth\s*=\s*["']?(\d+)/i.exec(attributes);
    if (widthAttr && Number(widthAttr[1]) >= TEMPLATE_WIDTH_PX) return true;
    const widthStyle = /\bwidth\s*:\s*(\d+)px/i.exec(attributes);
    if (widthStyle && Number(widthStyle[1]) >= TEMPLATE_WIDTH_PX) return true;
  }
  return false;
}

function textLength(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}
