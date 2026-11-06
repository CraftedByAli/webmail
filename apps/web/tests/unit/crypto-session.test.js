import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  generateToken,
  hashToken,
  signPayload,
  verifyPayload,
} from '@/lib/security/crypto';
import {
  createSession,
  resolveSession,
  revokeSession,
  revokeAllSessions,
  listSessions,
} from '@/lib/auth/session';

describe('crypto', () => {
  it('round-trips secrets bound to a token', () => {
    const token = generateToken();
    const enc = encryptSecret('p@ss', token);
    expect(enc).not.toContain('p@ss');
    expect(decryptSecret(enc, token)).toBe('p@ss');
    expect(() => decryptSecret(enc, generateToken())).toThrow();
  });

  it('hashes tokens deterministically', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });

  it('signs and verifies payloads with expiry', () => {
    const s = signPayload({ a: 1 }, 60);
    expect(verifyPayload(s)).toMatchObject({ a: 1 });
    expect(verifyPayload(`${s}x`)).toBeNull();
    expect(verifyPayload(signPayload({ a: 1 }, -10))).toBeNull();
  });
});

describe('sessions', () => {
  let token;
  beforeAll(() => {
    ({ token } = createSession({
      email: 'Test@Example.com',
      password: 'secret',
      userAgent: 'vitest',
      ip: '127.0.0.1',
    }));
  });

  it('resolves a valid token and decrypts credentials', () => {
    const s = resolveSession(token);
    expect(s.email).toBe('test@example.com');
    expect(s.credentials).toEqual({ user: 'test@example.com', pass: 'secret' });
  });

  it('rejects garbage tokens', () => {
    expect(resolveSession('nope')).toBeNull();
    expect(resolveSession(generateToken())).toBeNull();
  });

  it('lists and revokes sessions', () => {
    const { token: t2, session: s2 } = createSession({ email: 'test@example.com', password: 'x' });
    expect(listSessions('test@example.com').length).toBeGreaterThanOrEqual(2);
    expect(revokeSession(s2.id, 'other@example.com')).toBe(false);
    expect(revokeSession(s2.id, 'test@example.com')).toBe(true);
    expect(resolveSession(t2)).toBeNull();
    expect(revokeAllSessions('test@example.com')).toBeGreaterThanOrEqual(1);
    expect(resolveSession(token)).toBeNull();
  });
});
