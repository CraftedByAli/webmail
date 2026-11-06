import { NextResponse } from 'next/server';
import { createHandler, json, readJson } from '@/lib/api/handler';
import { AppError, errors } from '@/lib/api/errors';
import { authenticateMailbox } from '@/lib/mail';
import {
  addSessionAccount,
  isMailboxSignedInAnywhere,
  recordLogin,
  removeSessionAccount,
  reorderSessionAccounts,
} from '@/lib/auth/session';
import { describeAccounts, invalidateAccountStatus } from '@/lib/auth/accounts';
import { serializeAccountCookie, serializeClearedSessionCookie } from '@/lib/auth/cookies';
import { connectionManager } from '@/lib/imap/connection-manager';
import { invalidateUserCache } from '@/lib/cache/mail-cache';
import { checkRateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { isValidEmail } from '@/lib/mime/address';
import { logger } from '@/lib/logger';

/**
 * Mailboxes signed in to this browser session.
 *
 * GET    → every mailbox with its Inbox unread count (for the switcher).
 * POST   { email, password } → verifies and adds a mailbox (or refreshes its
 *        stored password when it is already signed in).
 * PATCH  { order: [email…] } → reorders the switcher.
 * DELETE { email } → signs one mailbox out of this browser; the others stay.
 */

export const GET = createHandler(
  async ({ session, url }) => {
    const withStatus = url.searchParams.get('status') !== '0';
    const described = await describeAccounts(session, { withStatus });
    return json({ ...described, active: session.email });
  },
  { allowMissingAccount: true }
);

export const POST = createHandler(
  async ({ session, request, ip, log }) => {
    const body = await readJson(request, 16 * 1024);
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');
    if (!isValidEmail(email) || !password || password.length > 1024) {
      throw errors.badRequest('Enter the mailbox address and its password.');
    }

    const ipLimit = checkRateLimit(`login:${ip}`, RATE_LIMITS.login);
    if (!ipLimit.allowed) throw errors.rateLimited(ipLimit.retryAfterSeconds);
    const accountLimit = checkRateLimit(`login-account:${email}`, RATE_LIMITS.loginPerAccount);
    if (!accountLimit.allowed) throw errors.rateLimited(accountLimit.retryAfterSeconds);

    const userAgent = request.headers.get('user-agent') || '';
    try {
      await authenticateMailbox({ user: email, pass: password });
    } catch (error) {
      recordLogin({ email, success: false, ip, userAgent });
      log.info(
        { operation: 'auth.addAccount', added: email, success: false },
        'add mailbox failed'
      );
      throw error;
    }
    recordLogin({ email, success: true, ip, userAgent });
    resetRateLimit(`login-account:${email}`);

    let result;
    try {
      result = addSessionAccount(session, { email, password });
    } catch (error) {
      if (error?.code === 'ACCOUNT_LIMIT') {
        throw new AppError(
          409,
          'account_limit',
          `You can be signed in to at most ${error.limit} mailboxes at once. Sign out of one first.`
        );
      }
      throw error;
    }
    invalidateAccountStatus(email);
    logger.info(
      { operation: 'auth.addAccount', mailbox: email, sessionId: session.id, added: result.added },
      'mailbox added to session'
    );

    const described = await describeAccounts(
      { ...session, accounts: result.accounts },
      { withStatus: false }
    );
    const response = NextResponse.json(
      { ...described, added: result.added, account: { email } },
      { status: result.added ? 201 : 200 }
    );
    response.headers.append('Set-Cookie', serializeAccountCookie(email));
    return response;
  },
  { allowMissingAccount: true, rateLimit: 'api' }
);

export const PATCH = createHandler(
  async ({ session, request }) => {
    const body = await readJson(request, 16 * 1024);
    if (!Array.isArray(body.order) || body.order.length > 50) throw errors.badRequest();
    const accounts = reorderSessionAccounts(
      session.id,
      body.order.map((e) => String(e).slice(0, 320))
    );
    const described = await describeAccounts({ ...session, accounts });
    return json({ ...described, active: session.email });
  },
  { allowMissingAccount: true }
);

export const DELETE = createHandler(
  async ({ session, request }) => {
    const body = await readJson(request, 16 * 1024);
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    if (!email) throw errors.badRequest();
    if (!session.accounts.some((a) => a.email === email)) {
      throw errors.notFound('That mailbox is not signed in on this device.');
    }

    const { remaining } = removeSessionAccount(session.id, email);
    if (!isMailboxSignedInAnywhere(email)) {
      await connectionManager.closeForUser(email).catch(() => {});
      invalidateUserCache(email);
    }
    invalidateAccountStatus(email);
    logger.info(
      { operation: 'auth.removeAccount', mailbox: email, sessionId: session.id, remaining },
      'mailbox signed out of session'
    );

    if (remaining === 0) {
      const response = NextResponse.json({ signedOut: true, accounts: [] });
      response.headers.append('Set-Cookie', serializeClearedSessionCookie());
      return response;
    }
    const accounts = session.accounts.filter((a) => a.email !== email);
    const described = await describeAccounts({ ...session, accounts });
    return json({ signedOut: false, ...described, next: described.accounts[0].email });
  },
  { allowMissingAccount: true }
);
