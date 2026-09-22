import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, clearAllRateLimits } from '@/lib/security/rate-limit';
import { verifyCsrf } from '@/lib/security/csrf';
import { sanitizeFilename, contentDisposition } from '@/lib/security/filename';
import {
  detectContentType,
  isBlockedExtension,
  safeResponseContentType,
  isInlineSafe,
} from '@/lib/security/mime';

describe('rate limit', () => {
  beforeEach(() => clearAllRateLimits());
  it('allows up to the limit then blocks', () => {
    for (let i = 0; i < 3; i++)
      expect(checkRateLimit('k', { limit: 3, windowMs: 1000 }).allowed).toBe(true);
    const r = checkRateLimit('k', { limit: 3, windowMs: 1000 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('csrf', () => {
  const req = (method, headers) => new Request('http://localhost:3000/api/x', { method, headers });
  it('allows safe methods', () => {
    expect(verifyCsrf(req('GET', {})).ok).toBe(true);
  });
  it('requires the custom header on mutations', () => {
    expect(verifyCsrf(req('POST', {})).ok).toBe(false);
    expect(verifyCsrf(req('POST', { 'x-requested-with': 'webmail' })).ok).toBe(true);
  });
  it('rejects cross-site fetches and foreign origins', () => {
    expect(
      verifyCsrf(req('POST', { 'x-requested-with': 'webmail', 'sec-fetch-site': 'cross-site' })).ok
    ).toBe(false);
    expect(
      verifyCsrf(
        req('POST', {
          'x-requested-with': 'webmail',
          origin: 'https://evil.example',
          host: 'localhost:3000',
        })
      ).ok
    ).toBe(false);
    expect(
      verifyCsrf(
        req('POST', {
          'x-requested-with': 'webmail',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        })
      ).ok
    ).toBe(true);
  });
});

describe('filenames', () => {
  it('prevents traversal and control characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\win.ini')).toBe('win.ini');
    expect(sanitizeFilename(`a${String.fromCharCode(0)}b.txt`)).toBe('a_b.txt');
    expect(sanitizeFilename('')).toBe('attachment');
    expect(sanitizeFilename('x'.repeat(300) + '.pdf').length).toBeLessThanOrEqual(180);
  });
  it('builds RFC 6266 headers', () => {
    expect(contentDisposition('résumé.pdf')).toBe(
      `attachment; filename="r_sum_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`
    );
  });
});

describe('mime', () => {
  it('detects content by magic bytes and ignores declared type', async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    expect(await detectContentType(png, 'text/html')).toBe('image/png');
    expect(await detectContentType(Buffer.from('plain text here'), 'text/html')).toBe('text/plain');
  });
  it('blocks executables', () => {
    expect(isBlockedExtension('setup.exe')).toBe(true);
    expect(isBlockedExtension('doc.pdf')).toBe(false);
  });
  it('never serves html/svg inline', () => {
    expect(safeResponseContentType('text/html')).toBe('application/octet-stream');
    expect(safeResponseContentType('image/svg+xml')).toBe('application/octet-stream');
    expect(isInlineSafe('image/svg+xml')).toBe(false);
    expect(isInlineSafe('application/pdf')).toBe(true);
  });
});
