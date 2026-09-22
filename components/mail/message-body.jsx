'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * Renders sanitized email HTML inside a sandboxed iframe.
 *
 * Sandbox: `allow-same-origin` (so cid: images load with our cookies and the
 * parent can measure the document height) but NO `allow-scripts`, so the
 * content is completely inert — it cannot run code, reach the parent window,
 * read cookies/storage or submit forms. A CSP <meta> inside the document adds
 * a second layer: no scripts, images only from our origin (+ https when the
 * user opts in), no frames/objects/forms.
 */
export function MessageBody({ body, allowExternal }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(80);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const srcDoc = useMemo(
    () => buildDocument(body.html, { allowExternal, dark }),
    [body.html, allowExternal, dark]
  );

  const measure = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !doc.body) return;
    // body height (not documentElement.scrollHeight, which never shrinks below the viewport)
    const rect = doc.body.getBoundingClientRect();
    const h = Math.ceil(rect.height + rect.top);
    if (h > 0 && Math.abs(h - height) > 2) setHeight(Math.max(24, Math.min(h + 12, 20000)));
  }, [height]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;
    let observer;
    const onLoad = () => {
      measure();
      const doc = iframe.contentDocument;
      if (doc?.body && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => measure());
        observer.observe(doc.body);
      }
      // Images load after the document; re-measure a few times.
      [150, 600, 1500].forEach((t) => setTimeout(measure, t));
    };
    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [measure, srcDoc]);

  if (body.kind === 'text' && !body.html) {
    return (
      <pre className="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap">
        {body.text}
      </pre>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title="Message content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={{ height }}
      className="block w-full border-0 bg-transparent"
      data-testid="message-body"
    />
  );
}

function buildDocument(html, { allowExternal, dark }) {
  const imgSrc = allowExternal ? "'self' data: https:" : "'self' data:";
  const csp = `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src 'none'; script-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; connect-src 'none'`;
  const fg = dark ? '#e6e8ee' : '#1c1f26';
  const link = dark ? '#7fb0ff' : '#1a56db';
  const quote = dark ? '#3a3f4b' : '#d0d4dc';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
:root{color-scheme:${dark ? 'dark' : 'light'}}
html,body{margin:0;padding:0;background:transparent}
body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${fg};word-wrap:break-word;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
img[data-blocked-src]{display:inline-block;min-width:24px;min-height:24px;border:1px dashed ${quote};background:${dark ? '#1b1e26' : '#f3f4f6'};color:transparent}
a{color:${link}}
blockquote,blockquote.q{margin:0.5em 0 0.5em 0;padding-left:1em;border-left:2px solid ${quote};color:${dark ? '#aab0bd' : '#5b6170'}}
pre{white-space:pre-wrap}
table{max-width:100%}
.plain{white-space:normal}
${dark ? 'body [style*="background"]:not([data-keep]){}' : ''}
</style></head><body>${html || ''}</body></html>`;
}
