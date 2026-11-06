import { describe, it, expect } from 'vitest';
import {
  sanitizeEmailHtml,
  sanitizeComposeHtml,
  sanitizeStyle,
} from '@/lib/security/sanitize-html';

describe('sanitizeEmailHtml', () => {
  it('removes scripts, event handlers and javascript: urls', () => {
    const { html } = sanitizeEmailHtml(
      '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)"><iframe src="https://evil"></iframe><form action="/x"><input></form>'
    );
    expect(html).not.toMatch(/script/i);
    expect(html).not.toMatch(/onclick|onerror/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/iframe|form|input/i);
  });

  it('blocks external images by default and counts them', () => {
    const r = sanitizeEmailHtml(
      '<img src="https://tracker.example/p.png" width="10" height="10"><img src="http://x/y.png">'
    );
    expect(r.blockedImages).toBe(2);
    expect(r.hasExternalContent).toBe(true);
    expect(r.html).toContain('data-blocked-src="https://tracker.example/p.png"');
    expect(r.html).not.toMatch(/ src="https:\/\/tracker/);
  });

  it('drops 1x1 tracking pixels entirely', () => {
    const r = sanitizeEmailHtml('<img src="https://t.example/p.gif" width="1" height="1">');
    expect(r.html).not.toContain('<img');
  });

  it('allows external images when opted in', () => {
    const r = sanitizeEmailHtml('<img src="https://cdn.example/a.png">', {
      allowExternalImages: true,
    });
    expect(r.html).toContain('src="https://cdn.example/a.png"');
    expect(r.blockedImages).toBe(0);
  });

  it('resolves cid images through the callback', () => {
    const r = sanitizeEmailHtml('<img src="cid:logo@1">', {
      resolveCid: (cid) => `/api/attachments/inline?cid=${cid}`,
    });
    expect(r.html).toContain('src="/api/attachments/inline?cid=logo@1"');
  });

  it('forces links to open in a new tab with noopener', () => {
    const r = sanitizeEmailHtml('<a href="https://example.com">x</a>');
    expect(r.html).toContain('target="_blank"');
    expect(r.html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('scrubs dangerous CSS', () => {
    const r = sanitizeEmailHtml(
      '<div style="background:url(https://x/y.png);position:fixed;width:expression(alert(1))">a</div>'
    );
    expect(r.html).not.toMatch(/url\(/);
    expect(r.html).not.toMatch(/expression/);
    expect(r.html).not.toMatch(/position:fixed/);
  });

  it('keeps safe formatting', () => {
    const r = sanitizeEmailHtml(
      '<table><tr><td style="color:#333">Cell</td></tr></table><p><b>bold</b> <em>em</em></p>'
    );
    expect(r.html).toContain('<table>');
    expect(r.html).toContain('style="color:#333"');
    expect(r.html).toContain('<b>bold</b>');
  });
});

describe('sanitizeStyle', () => {
  it('rejects @import and behaviors', () => {
    expect(sanitizeStyle('color:red;behavior:url(x.htc)')).toBe('');
    expect(sanitizeStyle('@import url(x)')).toBe('');
  });
});

describe('sanitizeComposeHtml', () => {
  it('keeps editor output but strips scripts', () => {
    const out = sanitizeComposeHtml(
      '<p style="color:#f00">hi</p><script>x</script><img src="data:image/png;base64,AAA">'
    );
    expect(out).toContain('<p style="color:#f00">hi</p>');
    expect(out).not.toContain('script');
    expect(out).toContain('<img src="data:image/png;base64,AAA"');
  });
});
