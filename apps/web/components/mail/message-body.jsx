'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Renders sanitized email HTML inside a sandboxed iframe.
 *
 * SECURITY — the frame gets `allow-same-origin` (so `cid:` images load with the
 * session cookie and the parent can measure height) but deliberately NOT
 * `allow-scripts`. The document is inert: even if the sanitizer missed
 * something, nothing can execute, reach the parent, or read cookies/storage.
 * A second CSP inside the document backs that up.
 *
 * PRESENTATION — the hard part of a dark-mode mail client is that email carries
 * its own colours. We do not try to invert them. Instead:
 *
 *   'app'    Plain correspondence with no design of its own. Rendered in the
 *            reader's theme; any stray `color:#000` is neutralised so it can
 *            never become black-on-black.
 *   'sender' Newsletters and templates that ship a full layout. Rendered on a
 *            light sheet exactly as designed, framed so it reads as an embedded
 *            document rather than a hole punched in the UI.
 */
export function MessageBody({ body, allowExternal }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const [showQuoted, setShowQuoted] = useState(false);
  const senderStyled = body.presentation === 'sender';

  return (
    <div className="min-w-0">
      <EmailFrame
        html={body.html}
        dark={dark}
        allowExternal={allowExternal}
        senderStyled={senderStyled}
      />

      {body.quoted ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowQuoted((v) => !v)}
            aria-expanded={showQuoted}
            className="bg-hover text-fg-muted hover:bg-active hover:text-fg-secondary focus-visible:outline-focus rounded-tight inline-flex h-5 items-center px-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
            <span className="sr-only">
              {showQuoted ? 'Hide quoted history' : 'Show quoted history'}
            </span>
          </button>
          {showQuoted ? (
            <div className="border-line mt-2 border-l-2 pl-3">
              <EmailFrame
                html={body.quoted}
                dark={dark}
                allowExternal={allowExternal}
                senderStyled={senderStyled}
                quoted
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmailFrame({ html, dark, allowExternal, senderStyled, quoted = false }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(quoted ? 60 : 48);

  const srcDoc = useMemo(
    () => buildDocument(html, { allowExternal, dark, senderStyled, quoted }),
    [html, allowExternal, dark, senderStyled, quoted]
  );

  const measure = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const rect = doc.body.getBoundingClientRect();
    const next = Math.ceil(rect.height + rect.top * 2);
    if (next > 0)
      setHeight((prev) => (Math.abs(next - prev) > 2 ? Math.min(next + 2, 40000) : prev));
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;
    let observer;
    const timers = [];
    const onLoad = () => {
      measure();
      const doc = iframe.contentDocument;
      if (doc?.body && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => measure());
        observer.observe(doc.body);
      }
      // Images and web fonts settle after load; re-measure a few times.
      for (const delay of [120, 500, 1400]) timers.push(setTimeout(measure, delay));
    };
    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      observer?.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [measure, srcDoc]);

  return (
    <iframe
      ref={iframeRef}
      title={quoted ? 'Quoted message' : 'Message content'}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={{ height }}
      className={cn(
        'block w-full border-0 bg-transparent',
        senderStyled && 'ring-line rounded-control overflow-hidden bg-white ring-1'
      )}
      data-testid={quoted ? 'message-body-quoted' : 'message-body'}
    />
  );
}

/**
 * Builds the iframe document. Everything the email can see is defined here.
 */
function buildDocument(html, { allowExternal, dark, senderStyled, quoted }) {
  const imgSrc = allowExternal ? "'self' data: https:" : "'self' data:";
  const csp = [
    "default-src 'none'",
    `img-src ${imgSrc}`,
    "style-src 'unsafe-inline'",
    "font-src 'none'",
    "script-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
  ].join('; ');

  // Sender-designed mail is always rendered on its own light sheet.
  const themed = senderStyled ? false : dark;
  const fg = senderStyled ? '#1a1d23' : themed ? '#e7e9ee' : '#16181d';
  const secondary = senderStyled ? '#5b6170' : themed ? '#a4abbb' : '#5b6170';
  const link = senderStyled ? '#1749b3' : themed ? '#7fb2ff' : '#1749b3';
  const rule = senderStyled ? '#d8dce4' : themed ? '#333a47' : '#d8dce4';
  const placeholder = themed && !senderStyled ? '#242a35' : '#eef0f4';

  /**
   * For 'app' mail we neutralise author colours. Without this a message that
   * hardcodes `color:#000` renders black-on-black the moment the reader
   * switches to dark mode — the single most common webmail rendering bug.
   *
   * Only links are exempt, so that they stay recognisable as links. `pre` and
   * `code` are deliberately not: a `<pre style="color:#111">` handed its own
   * dark colour is the same black-on-black bug, and children of an exempt
   * element inherit from it, so exempting one hides a whole subtree.
   */
  const neutralise = senderStyled
    ? ''
    : `
body *:not(a) { color: inherit !important; }
body *[style*="background"] { background-color: transparent !important; background-image: none !important; }
body font[color] { color: inherit !important; }`;

  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
:root { color-scheme: ${senderStyled ? 'light' : themed ? 'dark' : 'light'}; }
html { background: transparent; }
body {
  margin: 0;
  padding: ${senderStyled ? '0' : quoted ? '2px 0' : '0'};
  background: ${senderStyled ? '#ffffff' : 'transparent'};
  color: ${quoted ? secondary : fg};
  font: 15px/1.6 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  word-break: break-word;
  overflow-wrap: anywhere;
  -webkit-font-smoothing: antialiased;
}
${neutralise}
img { max-width: 100%; height: auto; border: 0; }
img[data-blocked-src] {
  display: inline-block;
  width: 18px !important; height: 18px !important;
  max-width: 18px !important; max-height: 18px !important;
  vertical-align: text-bottom;
  border: 1px dashed ${rule}; border-radius: 3px; background: ${placeholder};
}
${
  senderStyled
    ? /* The sender styled their own links — overriding them would repaint
         call-to-action buttons in our accent and destroy the contrast. */
      'a { text-underline-offset: 2px; }'
    : `a { color: ${link} !important; text-decoration: underline; text-underline-offset: 2px; }`
}
blockquote, blockquote.wm-quote {
  margin: 8px 0; padding: 0 0 0 12px;
  border-left: 2px solid ${rule}; color: ${secondary};
}
pre { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
table { max-width: 100%; border-collapse: collapse; }
hr { border: 0; border-top: 1px solid ${rule}; margin: 16px 0; }
h1, h2, h3 { line-height: 1.3; margin: 1em 0 0.4em; }
p { margin: 0 0 0.85em; }
p:last-child, div:last-child { margin-bottom: 0; }
ul, ol { padding-left: 24px; }
/* Plain-text mail keeps a comfortable measure; designed mail sets its own. */
.wm-plain { max-width: 68ch; }
${
  senderStyled
    ? /* Fixed-width email layouts are centred so the sheet reads as a framed
         document rather than content stranded against one edge. */
      'body > table, body > div, body > center { margin-left: auto !important; margin-right: auto !important; }'
    : ''
}
</style></head><body>${html || ''}</body></html>`;
}
