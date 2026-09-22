import { NextResponse } from 'next/server';
import { AppError, errors, mapMailError } from '@/lib/api/errors';
import { logger, serializeError } from '@/lib/logger';
import { readSessionToken } from '@/lib/auth/cookies';
import { resolveSession } from '@/lib/auth/session';
import { verifyCsrf } from '@/lib/security/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { getClientIp } from '@/lib/security/request';

/**
 * @typedef {Object} HandlerContext
 * @property {Request} request
 * @property {import('@/lib/auth/session').AuthenticatedSession | null} session
 * @property {Record<string, string>} params
 * @property {URL} url
 * @property {string} ip
 * @property {import('pino').Logger} log
 */

/**
 * JSON response helper.
 * @param {unknown} data
 * @param {ResponseInit} [init]
 */
export function json(data, init) {
  return NextResponse.json(data, init);
}

/**
 * Wraps a route handler with authentication, CSRF protection, rate limiting
 * and uniform error handling.
 *
 * @param {(ctx: HandlerContext) => Promise<Response>} fn
 * @param {{ auth?: boolean, csrf?: boolean, rateLimit?: keyof typeof RATE_LIMITS | false }} [options]
 */
export function createHandler(fn, options = {}) {
  const { auth = true, csrf = true, rateLimit = 'api' } = options;

  return async function handler(request, routeContext) {
    const started = Date.now();
    const url = new URL(request.url);
    const ip = getClientIp(request);
    const log = logger.child({ method: request.method, path: url.pathname, ip });

    try {
      if (rateLimit) {
        const result = checkRateLimit(`${rateLimit}:${ip}`, RATE_LIMITS[rateLimit]);
        if (!result.allowed) throw errors.rateLimited(result.retryAfterSeconds);
      }

      if (csrf) {
        const check = verifyCsrf(request);
        if (!check.ok) {
          log.warn({ reason: check.reason }, 'csrf check failed');
          throw errors.csrf();
        }
      }

      let session = null;
      if (auth) {
        session = resolveSession(readSessionToken(request));
        if (!session) throw errors.unauthorized();
      }

      const params = routeContext?.params ? await routeContext.params : {};
      const response = await fn({
        request,
        session,
        params,
        url,
        ip,
        log: session ? log.child({ mailbox: session.email }) : log,
      });
      const durationMs = Date.now() - started;
      if (durationMs > 3000) log.warn({ durationMs, status: response.status }, 'slow request');
      return response;
    } catch (error) {
      return errorResponse(error, log);
    }
  };
}

/**
 * Converts any thrown value into a safe JSON error response.
 * @param {unknown} error
 * @param {import('pino').Logger} log
 */
export function errorResponse(error, log = logger) {
  let appError = error instanceof AppError ? error : null;
  if (!appError) {
    // Anything from the mail layer gets mapped; everything else is internal.
    const e = /** @type {any} */ (error);
    const looksLikeMailError =
      e &&
      (e.authenticationFailed ||
        e.responseText ||
        e.serverResponseCode ||
        /^E[A-Z]+$/.test(String(e.code || '')));
    appError = looksLikeMailError ? mapMailError(error) : errors.internal(error);
  }

  const logPayload = {
    status: appError.status,
    code: appError.code,
    err: serializeError(appError.cause || appError),
  };
  if (appError.status >= 500) log.error(logPayload, 'request failed');
  else if (appError.status === 401 && appError.code === 'unauthorized')
    log.debug(logPayload, 'unauthenticated');
  else log.warn(logPayload, 'request rejected');

  const headers = {};
  if (appError.status === 429 && appError.details?.retryAfter) {
    headers['Retry-After'] = String(appError.details.retryAfter);
  }
  return NextResponse.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.status < 500 ? appError.details : undefined,
      },
    },
    { status: appError.status, headers }
  );
}

/**
 * Reads and validates a JSON body.
 * @param {Request} request
 * @param {number} [maxBytes]
 */
export async function readJson(request, maxBytes = 2 * 1024 * 1024) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw errors.tooLarge('Request body is too large.');
  try {
    const text = await request.text();
    if (text.length > maxBytes) throw errors.tooLarge('Request body is too large.');
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw errors.badRequest('Request body must be valid JSON.');
  }
}
