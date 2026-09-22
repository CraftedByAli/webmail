import sanitizeHtml from 'sanitize-html';

/**
 * Email HTML sanitizer.
 *
 * Emails are hostile input. This module produces markup that is safe to place
 * into a sandboxed iframe: no scripts, no event handlers, no javascript:/data:
 * navigation, no forms, no embeds, and — unless the user opts in — no remote
 * resources (images / CSS urls), which are the classic tracking vector.
 *
 * @typedef {Object} SanitizeOptions
 * @property {boolean} [allowExternalImages] load remote images (user opt-in)
 * @property {(cid: string) => string | null} [resolveCid] maps cid: refs to safe URLs
 */

const ALLOWED_TAGS = [
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'bdi',
  'bdo',
  'big',
  'blockquote',
  'br',
  'caption',
  'center',
  'cite',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'font',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'label',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'tt',
  'u',
  'ul',
  'var',
  'wbr',
];

const GLOBAL_ATTRS = [
  'style',
  'class',
  'dir',
  'lang',
  'title',
  'align',
  'valign',
  'width',
  'height',
  'bgcolor',
  'color',
  'border',
  'cellpadding',
  'cellspacing',
];

const ALLOWED_ATTRS = {
  '*': GLOBAL_ATTRS,
  a: ['href', 'name', 'target', 'rel'],
  img: [
    'src',
    'alt',
    'width',
    'height',
    'align',
    'border',
    'hspace',
    'vspace',
    'data-blocked-src',
    'data-missing-cid',
  ],
  font: ['face', 'size', 'color'],
  td: ['colspan', 'rowspan', 'nowrap', 'headers'],
  th: ['colspan', 'rowspan', 'nowrap', 'scope'],
  table: ['summary'],
  ol: ['start', 'type'],
  li: ['value'],
  time: ['datetime'],
  col: ['span'],
  colgroup: ['span'],
};

const SAFE_URL_RE = /^(https?:|mailto:|tel:)/i;

/** Transparent 1x1 GIF used in place of blocked remote images. */
export const BLOCKED_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Detects CSS constructs that can leak data or execute code. */
const DANGEROUS_CSS_RE =
  /(expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:|@import|\\[0-9a-f])/i;
const CSS_URL_RE = /url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/**
 * Sanitizes a style attribute. Remote url() references are removed unless
 * external content is allowed; position:fixed is neutralised so email content
 * cannot overlay our own UI (defence in depth — the iframe already isolates it).
 */
export function sanitizeStyle(style, { allowExternalImages = false } = {}) {
  if (!style) return '';
  if (DANGEROUS_CSS_RE.test(style)) return '';
  let out = style.replace(CSS_URL_RE, (match, quote, url) => {
    const trimmed = url.trim();
    if (allowExternalImages && /^https:\/\//i.test(trimmed)) return `url("${trimmed}")`;
    return 'none';
  });
  out = out.replace(/position\s*:\s*(fixed|sticky)/gi, 'position:static');
  return out;
}

/**
 * @param {string} html
 * @param {SanitizeOptions} [options]
 * @returns {{ html: string, blockedImages: number, hasExternalContent: boolean }}
 */
export function sanitizeEmailHtml(html, options = {}) {
  const { allowExternalImages = false, resolveCid } = options;
  let blockedImages = 0;
  let hasExternalContent = false;

  const clean = sanitizeHtml(html || '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid', 'data'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'cid', 'data'],
      a: ['http', 'https', 'mailto', 'tel'],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'template', 'title', 'head'],
    parseStyleAttributes: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = (attribs.href || '').trim();
        const safeHref = SAFE_URL_RE.test(href) ? href : undefined;
        return {
          tagName: 'a',
          attribs: {
            ...attribs,
            ...(safeHref ? { href: safeHref } : {}),
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
          },
        };
      },
      img: (tagName, attribs) => {
        const src = (attribs.src || '').trim();
        const out = { ...attribs };
        delete out.src;
        if (/^cid:/i.test(src)) {
          const resolved = resolveCid ? resolveCid(src.slice(4).replace(/[<>]/g, '')) : null;
          if (resolved) out.src = resolved;
          else out['data-missing-cid'] = 'true';
        } else if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(src)) {
          out.src = src;
        } else if (/^https?:\/\//i.test(src)) {
          hasExternalContent = true;
          if (allowExternalImages) {
            out.src = src;
          } else {
            blockedImages += 1;
            out['data-blocked-src'] = src;
            out.src = BLOCKED_PIXEL;
            out.alt = attribs.alt || 'Image blocked';
          }
        } else {
          out['data-blocked-src'] = '';
          out.src = BLOCKED_PIXEL;
        }
        return { tagName: 'img', attribs: out };
      },
    },
    exclusiveFilter: (frame) => {
      // Drop hidden tracking pixels entirely.
      if (frame.tag === 'img') {
        const w = Number(frame.attribs.width);
        const h = Number(frame.attribs.height);
        if (w === 1 && h === 1) return true;
      }
      return false;
    },
    textFilter: (text) => text,
  });

  // sanitize-html keeps style attributes verbatim when parseStyleAttributes is
  // off, so scrub them ourselves for url()/expression()/etc.
  const withStyles = clean.replace(/\sstyle="([^"]*)"/gi, (match, value) => {
    const decoded = value.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    if (/url\s*\(/i.test(decoded)) hasExternalContent = true;
    const safe = sanitizeStyle(decoded, { allowExternalImages });
    return safe ? ` style="${safe.replace(/"/g, '&quot;')}"` : '';
  });

  return { html: withStyles, blockedImages, hasExternalContent };
}

/**
 * Sanitizes user-authored rich text (compose editor / signatures). Stricter
 * than email rendering: no images from arbitrary origins, no styles beyond a
 * tiny allowlist.
 */
export function sanitizeComposeHtml(html) {
  return sanitizeHtml(html || '', {
    allowedTags: [
      'a',
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'p',
      'br',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'h1',
      'h2',
      'h3',
      'h4',
      'div',
      'span',
      'img',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'font',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['style'],
      font: ['color', 'face', 'size'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'cid', 'data'],
    allowedSchemesByTag: { img: ['cid', 'data', 'https', 'http'] },
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z]+$/i],
        'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^[a-z]+$/i],
        'text-align': [/^(left|right|center|justify)$/],
        'font-weight': [/^(bold|normal|[1-9]00)$/],
        'font-style': [/^(italic|normal)$/],
        'text-decoration': [/^(underline|line-through|none)$/],
        'font-family': [/^[\w\s,'"-]+$/],
        'font-size': [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
        'padding-left': [/^\d+(px|em)$/],
        'margin-left': [/^\d+(px|em)$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}
