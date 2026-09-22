import pino from 'pino';

/**
 * Structured application logger.
 *
 * Sensitive keys are redacted at the logger level so that no code path can
 * accidentally write passwords, tokens or cookies to the log stream.
 */

const REDACT_PATHS = [
  'password',
  '*.password',
  '*.*.password',
  'pass',
  '*.pass',
  'auth.pass',
  '*.auth.pass',
  'token',
  '*.token',
  'sessionToken',
  '*.sessionToken',
  'cookie',
  'headers.cookie',
  '*.headers.cookie',
  'headers.authorization',
  '*.headers.authorization',
  'encryptedSecret',
  '*.encryptedSecret',
];

function createLogger() {
  const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  const format =
    process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');

  /** @type {import('pino').LoggerOptions} */
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'webmail' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (format === 'pretty' && process.env.NODE_ENV !== 'production') {
    try {
      return pino(options, pino.transport({ target: 'pino-pretty', options: { colorize: true } }));
    } catch {
      // pino-pretty is a dev dependency; fall back to JSON output.
    }
  }
  return pino(options);
}

const globalKey = Symbol.for('webmail.logger');
if (!globalThis[globalKey]) {
  globalThis[globalKey] = createLogger();
}

/** @type {import('pino').Logger} */
export const logger = globalThis[globalKey];

/**
 * Creates a child logger bound to an operation name.
 * @param {string} operation
 * @param {Record<string, unknown>} [bindings]
 */
export function opLogger(operation, bindings = {}) {
  return logger.child({ operation, ...bindings });
}

/**
 * Measures the duration of an async operation and logs it.
 * @template T
 * @param {string} operation
 * @param {Record<string, unknown>} bindings
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function timed(operation, bindings, fn) {
  const start = process.hrtime.bigint();
  try {
    const result = await fn();
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const log = logger.child({ operation, ...bindings, durationMs: Math.round(durationMs) });
    if (durationMs > 2000) log.warn('slow operation');
    else log.debug('operation complete');
    return result;
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.error(
      { operation, ...bindings, durationMs: Math.round(durationMs), err: serializeError(error) },
      'operation failed'
    );
    throw error;
  }
}

/**
 * Converts an error into a log-safe object (never includes credentials).
 * @param {unknown} error
 */
export function serializeError(error) {
  if (!error || typeof error !== 'object') return { message: String(error) };
  const { message, code, name, responseText, serverResponseCode, stack } = /** @type {any} */ (
    error
  );
  return { message, code, name, responseText, serverResponseCode, stack };
}
