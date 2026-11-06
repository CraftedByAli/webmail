/**
 * Application error with an HTTP status and a user-safe message. Internal
 * details stay in `cause` and are only written to server logs.
 */
export class AppError extends Error {
  /**
   * @param {number} status
   * @param {string} code machine-readable code
   * @param {string} message user-safe message
   * @param {{ cause?: unknown, details?: Record<string, unknown> }} [options]
   */
  constructor(status, code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
  }
}

export const errors = {
  badRequest: (message = 'Invalid request.', details) =>
    new AppError(400, 'bad_request', message, { details }),
  unauthorized: (message = 'Please sign in to continue.') =>
    new AppError(401, 'unauthorized', message),
  forbidden: (message = 'You do not have access to this resource.') =>
    new AppError(403, 'forbidden', message),
  notFound: (message = 'Not found.') => new AppError(404, 'not_found', message),
  accountSignedOut: (email) =>
    new AppError(401, 'account_signed_out', 'That mailbox is no longer signed in on this device.', {
      details: { account: email },
    }),
  tooLarge: (message = 'The file is too large.') => new AppError(413, 'payload_too_large', message),
  rateLimited: (retryAfter) =>
    new AppError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.', {
      details: { retryAfter },
    }),
  csrf: () =>
    new AppError(
      403,
      'csrf',
      'Request blocked for security reasons. Reload the page and try again.'
    ),
  mailServer: (message = 'Unable to reach the mail server. Please try again.', cause) =>
    new AppError(502, 'mail_server', message, { cause }),
  internal: (cause) =>
    new AppError(500, 'internal', 'Something went wrong. Please try again.', { cause }),
};

/**
 * Maps an IMAP/SMTP library error to a user-safe AppError.
 * @param {unknown} error
 */
export function mapMailError(error) {
  if (error instanceof AppError) return error;
  const e = /** @type {any} */ (error) || {};
  const code = e.code || e.authenticationFailed ? 'AUTH' : e.code;
  const text = String(e.responseText || e.message || '');

  if (e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|535/i.test(text)) {
    return new AppError(401, 'invalid_credentials', 'Incorrect email or password.', {
      cause: error,
    });
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
    return errors.mailServer(
      'The mail server is not reachable right now. Please try again shortly.',
      error
    );
  }
  if (code === 'ETIMEDOUT' || code === 'ETIMEOUT' || /timeout/i.test(text)) {
    return errors.mailServer('The mail server took too long to respond. Please try again.', error);
  }
  if (/CERT|certificate|self signed|TLS|SSL/i.test(text)) {
    return errors.mailServer('Secure connection to the mail server failed.', error);
  }
  if (/NONEXISTENT|Mailbox doesn't exist|does not exist/i.test(text)) {
    return errors.notFound('That folder no longer exists.');
  }
  if (/ALREADYEXISTS|already exists/i.test(text)) {
    return errors.badRequest('A folder with that name already exists.');
  }
  if (/LIMIT|too large|exceeds|552/i.test(text)) {
    return errors.tooLarge('The message is too large for the mail server.');
  }
  if (/5\d\d/.test(String(e.responseCode || ''))) {
    return errors.mailServer('The mail server rejected the message.', error);
  }
  return errors.mailServer(undefined, error);
}
