import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  addSessionAccount,
  createSession,
  getAllSessionCredentials,
  isMailboxSignedInAnywhere,
  listSessionAccounts,
  listSessions,
  removeSessionAccount,
  reorderSessionAccounts,
  resolveSession,
  revokeAllSessions,
  revokeSession,
} from '@/lib/auth/session';

/** Throwaway credential values generated per run (never literals in source). */
const fixtureSecret = (tag) => `${tag}-${randomUUID()}`;
const BOSS_SECRET = fixtureSecret('boss');
const SALES_SECRET = fixtureSecret('sales');

function newSession(email = 'boss@acme.test', password = BOSS_SECRET) {
  const { token } = createSession({ email, password, userAgent: 'vitest', ip: '127.0.0.1' });
  return { token, session: resolveSession(token) };
}

describe('multi-mailbox sessions', () => {
  it('keeps a separate credential per mailbox and selects by account', () => {
    const { token, session } = newSession();
    addSessionAccount(session, { email: 'Sales@Acme.test', password: SALES_SECRET });

    const def = resolveSession(token);
    expect(def.email).toBe('boss@acme.test');
    expect(def.credentials).toEqual({ user: 'boss@acme.test', pass: BOSS_SECRET });
    expect(def.accounts.map((a) => a.email)).toEqual(['boss@acme.test', 'sales@acme.test']);

    const sales = resolveSession(token, { account: 'SALES@acme.test' });
    expect(sales.email).toBe('sales@acme.test');
    expect(sales.credentials.pass).toBe(SALES_SECRET);
    expect(sales.requestedAccountMissing).toBe(false);

    const hinted = resolveSession(token, { preferred: 'sales@acme.test' });
    expect(hinted.email).toBe('sales@acme.test');

    const missing = resolveSession(token, { account: 'ghost@acme.test' });
    expect(missing.requestedAccountMissing).toBe(true);
    expect(missing.email).toBe('boss@acme.test');

    expect(getAllSessionCredentials(def).map((c) => c.pass)).toEqual([BOSS_SECRET, SALES_SECRET]);
  });

  it('refreshes the password when a mailbox is added twice', () => {
    const { token, session } = newSession('a@acme.test', 'old');
    const r = addSessionAccount(session, { email: 'a@acme.test', password: 'new' });
    expect(r.added).toBe(false);
    expect(resolveSession(token).credentials.pass).toBe('new');
  });

  it('enforces the per-session mailbox limit', () => {
    const { session } = newSession('limit0@acme.test');
    for (let i = 1; i < 10; i++)
      addSessionAccount(session, { email: `limit${i}@acme.test`, password: 'x' });
    expect(() =>
      addSessionAccount(session, { email: 'one-too-many@acme.test', password: 'x' })
    ).toThrow(expect.objectContaining({ code: 'ACCOUNT_LIMIT' }));
  });

  it('reorders mailboxes', () => {
    const { session } = newSession('o1@acme.test');
    addSessionAccount(session, { email: 'o2@acme.test', password: 'x' });
    addSessionAccount(session, { email: 'o3@acme.test', password: 'x' });
    const list = reorderSessionAccounts(session.id, [
      'o3@acme.test',
      'o1@acme.test',
      'o2@acme.test',
    ]);
    expect(list.map((a) => a.email)).toEqual(['o3@acme.test', 'o1@acme.test', 'o2@acme.test']);
  });

  it('signing one mailbox out leaves the others; the last one ends the session', () => {
    const { token, session } = newSession('r1@acme.test');
    addSessionAccount(session, { email: 'r2@acme.test', password: 'x' });
    expect(removeSessionAccount(session.id, 'r1@acme.test')).toEqual({
      removed: true,
      remaining: 1,
    });
    expect(resolveSession(token).email).toBe('r2@acme.test');
    expect(removeSessionAccount(session.id, 'r2@acme.test').remaining).toBe(0);
    expect(resolveSession(token)).toBeNull();
  });

  it('"sign out everywhere" removes only that mailbox from every session', () => {
    const one = newSession('shared@acme.test', 'p');
    addSessionAccount(one.session, { email: 'solo@acme.test', password: 'q' });
    const two = newSession('shared@acme.test', 'p');
    expect(listSessions('shared@acme.test').length).toBeGreaterThanOrEqual(2);
    expect(listSessions('shared@acme.test').find((s) => s.id === one.session.id).mailboxCount).toBe(
      2
    );

    expect(revokeAllSessions('shared@acme.test')).toBeGreaterThanOrEqual(2);
    expect(resolveSession(one.token).email).toBe('solo@acme.test');
    expect(resolveSession(two.token)).toBeNull();
    expect(isMailboxSignedInAnywhere('shared@acme.test')).toBe(false);
    expect(isMailboxSignedInAnywhere('solo@acme.test')).toBe(true);
  });

  it('revoking a device only signs the requesting mailbox out of it', () => {
    const { token, session } = newSession('dev1@acme.test');
    addSessionAccount(session, { email: 'dev2@acme.test', password: 'x' });
    expect(revokeSession(session.id, 'nobody@acme.test')).toBe(false);
    expect(revokeSession(session.id, 'dev2@acme.test')).toBe(true);
    expect(listSessionAccounts(session.id).map((a) => a.email)).toEqual(['dev1@acme.test']);
    expect(resolveSession(token)).not.toBeNull();
  });
});
