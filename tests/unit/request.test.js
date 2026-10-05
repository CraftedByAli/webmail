import { describe, it, expect, afterEach } from 'vitest';
import { getClientIp } from '@/lib/security/request';
import { getConfig, resetConfigForTests } from '@/lib/config/env';

const req = (headers) => new Request('http://localhost:3000/api/x', { headers });

describe('client ip behind a reverse proxy', () => {
  it('ignores client-supplied X-Forwarded-For entries', () => {
    // nginx: proxy_add_x_forwarded_for appends the real peer to whatever the client sent.
    const r = req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' });
    expect(getClientIp(r, { hops: 1 })).toBe('203.0.113.7');
  });

  it('counts each trusted hop from the right', () => {
    // Cloudflare appends the client, then nginx appends the Cloudflare edge.
    const r = req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 172.68.1.1' });
    expect(getClientIp(r, { hops: 2 })).toBe('203.0.113.7');
  });

  it('never indexes past the left end', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.7' }), { hops: 3 })).toBe('203.0.113.7');
  });

  it('falls back to X-Real-IP set by a single proxy', () => {
    expect(getClientIp(req({ 'x-real-ip': '203.0.113.9' }), { hops: 1 })).toBe('203.0.113.9');
  });

  it('only believes CF-Connecting-IP when told to', () => {
    const r = req({ 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '203.0.113.7' });
    expect(getClientIp(r, { hops: 1, trustCloudflare: false })).toBe('203.0.113.7');
    expect(getClientIp(r, { hops: 1, trustCloudflare: true })).toBe('6.6.6.6');
  });

  it('trusts no forwarding headers with zero hops', () => {
    const r = req({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '6.6.6.6' });
    expect(getClientIp(r, { hops: 0 })).toBe('unknown');
  });
});

describe('mail TLS servername', () => {
  afterEach(() => {
    delete process.env.MAIL_TLS_SERVERNAME;
    resetConfigForTests();
  });

  it('is unset by default so the host name is verified', () => {
    resetConfigForTests();
    const { imap, smtp, sieve } = getConfig();
    expect(imap.servername).toBeUndefined();
    expect(smtp.servername).toBeUndefined();
    expect(sieve.servername).toBeUndefined();
  });

  it('applies to IMAP, SMTP and ManageSieve', () => {
    process.env.MAIL_TLS_SERVERNAME = 'mail.example.com';
    resetConfigForTests();
    const { imap, smtp, sieve } = getConfig();
    expect([imap.servername, smtp.servername, sieve.servername]).toEqual([
      'mail.example.com',
      'mail.example.com',
      'mail.example.com',
    ]);
  });
});
