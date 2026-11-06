import { NextResponse } from 'next/server';
import { createHandler, readJson } from '@/lib/api/handler';
import { errors } from '@/lib/api/errors';
import { authenticateMailbox } from '@/lib/mail';
import {
  addSessionAccount,
  createSession,
  pruneSessions,
  recordLogin,
  resolveSession,
} from '@/lib/auth/session';
import {
  readSessionToken,
  serializeAccountCookie,
  serializeSessionCookie,
} from '@/lib/auth/cookies';
import { checkRateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { isValidEmail } from '@/lib/mime/address';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Verifies the Mailcow mailbox credentials over IMAP and establishes an
 * HTTP-only cookie session. The password is never returned to the client.
 *
 * If the browser already holds a valid session, the mailbox is added to it
 * instead, so signing in to a second mailbox never signs out the first.
 */
export const POST = createHandler(
  async ({ request, ip }) => {
    const body = await readJson(request, 16 * 1024);
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');

    if (!isValidEmail(email) || !password || password.length > 1024) {
      throw errors.badRequest('Enter your email address and password.');
    }

    // Per-account throttle on top of the per-IP limit applied by createHandler.
    const accountLimit = checkRateLimit(`login-account:${email}`, RATE_LIMITS.loginPerAccount);
    if (!accountLimit.allowed) throw errors.rateLimited(accountLimit.retryAfterSeconds);

    const userAgent = request.headers.get('user-agent') || '';
    try {
      await authenticateMailbox({ user: email, pass: password });
    } catch (error) {
      recordLogin({ email, success: false, ip, userAgent });
      logger.info({ operation: 'auth.login', mailbox: email, ip, success: false }, 'login failed');
      throw error;
    }

    recordLogin({ email, success: true, ip, userAgent });
    resetRateLimit(`login-account:${email}`);
    resetRateLimit(`login:${ip}`);
    pruneSessions();

    const existing = resolveSession(readSessionToken(request));
    if (existing) {
      try {
        const result = addSessionAccount(existing, { email, password });
        logger.info(
          { operation: 'auth.login', mailbox: email, ip, success: true, sessionId: existing.id },
          'mailbox added to existing session'
        );
        const response = NextResponse.json({
          user: { email },
          session: { id: existing.id, expiresAt: existing.expiresAt },
          accounts: result.accounts.map((a) => a.email),
        });
        response.headers.append('Set-Cookie', serializeAccountCookie(email));
        return response;
      } catch (error) {
        if (error?.code !== 'ACCOUNT_LIMIT') throw error;
        // Full session: fall through and start a fresh one for this mailbox.
      }
    }

    const { token, session } = createSession({ email, password, userAgent, ip });
    logger.info(
      { operation: 'auth.login', mailbox: email, ip, success: true, sessionId: session.id },
      'login succeeded'
    );

    const response = NextResponse.json({
      user: { email },
      session: { id: session.id, expiresAt: session.expiresAt },
    });
    response.headers.append('Set-Cookie', serializeSessionCookie(token));
    response.headers.append('Set-Cookie', serializeAccountCookie(email));
    return response;
  },
  { auth: false, rateLimit: 'login' }
);
