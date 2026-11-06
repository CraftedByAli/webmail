import { getConfig } from '@/lib/config/env';
import { getAllSessionCredentials } from '@/lib/auth/session';
import { getProvider } from '@/lib/mail';
import { mailCache } from '@/lib/cache/mail-cache';
import { mapMailError } from '@/lib/api/errors';
import { logger, serializeError } from '@/lib/logger';

const STATUS_TTL_MS = 15_000;
const STATUS_TIMEOUT_MS = 6_000;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error('status timeout'), { code: 'ETIMEDOUT' })),
        ms
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Inbox unread count for one mailbox, cached briefly and never throwing. */
async function inboxStatus(credentials) {
  const key = `account-status:${credentials.user.toLowerCase()}`;
  const cached = mailCache.get(key);
  if (cached !== undefined) return cached;
  let result;
  try {
    const provider = await getProvider({ credentials });
    const status = await withTimeout(provider.getFolderStatus('INBOX'), STATUS_TIMEOUT_MS);
    result = { state: 'ok', unread: status.unread ?? 0, total: status.total ?? 0 };
    mailCache.set(key, result, STATUS_TTL_MS);
  } catch (error) {
    const mapped = mapMailError(error);
    result = {
      state: mapped.code === 'invalid_credentials' ? 'reauth' : 'error',
      unread: null,
      total: null,
      message:
        mapped.code === 'invalid_credentials'
          ? 'The password for this mailbox changed. Sign in to it again.'
          : mapped.message,
    };
    logger.debug(
      { operation: 'accounts.status', mailbox: credentials.user, err: serializeError(error) },
      'mailbox status unavailable'
    );
  }
  return result;
}

/** Drops the cached unread count so the switcher refreshes after mail changes. */
export function invalidateAccountStatus(email) {
  mailCache.delete(`account-status:${email.toLowerCase()}`);
}

/**
 * Public description of the mailboxes signed in to a session.
 * @param {import('@/lib/auth/session').AuthenticatedSession} session
 * @param {{ withStatus?: boolean }} [options]
 */
export async function describeAccounts(session, { withStatus = false } = {}) {
  const { app, session: sessionConfig } = getConfig();
  const base = session.accounts.map((a, index) => ({
    email: a.email,
    primary: index === 0,
    addedAt: a.addedAt,
    isAdmin: app.adminEmails.includes(a.email),
  }));
  if (!withStatus) return { accounts: base, max: sessionConfig.maxAccounts };

  const credentials = new Map(getAllSessionCredentials(session).map((c) => [c.user, c]));
  const statuses = await Promise.all(
    base.map((a) =>
      credentials.has(a.email)
        ? inboxStatus(credentials.get(a.email))
        : Promise.resolve({ state: 'reauth', unread: null, total: null })
    )
  );
  return {
    accounts: base.map((a, i) => ({ ...a, status: statuses[i] })),
    max: sessionConfig.maxAccounts,
  };
}
