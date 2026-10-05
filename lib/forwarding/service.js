import { getConfig } from '@/lib/config/env';
import { AppError, errors } from '@/lib/api/errors';
import { isValidEmail } from '@/lib/mime/address';
import { logger, serializeError } from '@/lib/logger';
import { sieveExtensions, withManageSieve } from '@/lib/sieve/managesieve';
import {
  DEFAULT_FORWARDING,
  FORWARDING_SCRIPT_NAME,
  buildForwardingScript,
  parseForwardingScript,
} from '@/lib/sieve/forwarding-script';

/**
 * @typedef {Object} ForwardingState
 * @property {boolean} available      the server's filter service is reachable
 * @property {boolean} enabled        forwarding is configured on
 * @property {'off'|'active'|'overridden'} state
 *   `overridden`: enabled here, but another app activated a different script
 * @property {string[]} addresses
 * @property {boolean} keepCopy
 * @property {boolean} skipSpam
 * @property {string|null} otherScript  another script that is (or was) active
 * @property {number|null} updatedAt
 * @property {{ maxAddresses: number, allowedDomains: string[] }} limits
 * @property {string} [message]
 */

function limits() {
  const { sieve } = getConfig();
  return {
    maxAddresses: sieve.maxForwardAddresses,
    allowedDomains: sieve.forwardingAllowedDomains,
  };
}

/**
 * Validates user input into a forwarding config. Throws 400 with a message
 * the settings page can show next to the field.
 * @param {any} input
 * @param {{ mailbox: string }} context
 */
export function normalizeForwardingInput(input, { mailbox }) {
  const { maxAddresses, allowedDomains } = limits();
  if (!input || typeof input !== 'object') throw errors.badRequest('Invalid forwarding settings.');
  const raw = Array.isArray(input.addresses) ? input.addresses : [];
  if (raw.length > 50) throw errors.badRequest('Too many addresses.');

  const addresses = [];
  for (const value of raw) {
    const address = String(value || '')
      .trim()
      .toLowerCase();
    if (!address) continue;
    if (address.length > 254 || !isValidEmail(address)) {
      throw errors.badRequest(`"${address.slice(0, 80)}" is not a valid email address.`, {
        field: 'addresses',
      });
    }
    if (address === mailbox.toLowerCase()) {
      throw errors.badRequest('A mailbox cannot forward to itself.', { field: 'addresses' });
    }
    const domain = address.split('@')[1];
    if (allowedDomains.length && !allowedDomains.includes(domain)) {
      throw errors.badRequest(
        `Forwarding to ${domain} is not allowed. Allowed: ${allowedDomains.join(', ')}.`,
        { field: 'addresses' }
      );
    }
    if (!addresses.includes(address)) addresses.push(address);
  }
  if (addresses.length > maxAddresses) {
    throw errors.badRequest(
      `You can forward to at most ${maxAddresses} address${maxAddresses === 1 ? '' : 'es'}.`,
      { field: 'addresses' }
    );
  }
  const enabled = !!input.enabled;
  if (enabled && addresses.length === 0) {
    throw errors.badRequest('Add the address mail should be forwarded to.', {
      field: 'addresses',
    });
  }
  return {
    enabled,
    addresses,
    keepCopy: input.keepCopy !== false,
    skipSpam: input.skipSpam !== false,
  };
}

/** Maps ManageSieve / socket failures to user-facing errors. */
export function mapSieveError(error) {
  if (error instanceof AppError) return error;
  const code = String(error?.code || '');
  const text = String(error?.message || '');
  if (error?.authenticationFailed || code === 'EAUTH') {
    return new AppError(
      401,
      'invalid_credentials',
      'The mail server did not accept this mailbox’s password. Sign in to it again.',
      { cause: error }
    );
  }
  if (
    [
      'ECONNREFUSED',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNCLOSED',
      'ENOTLS',
      'ENOAUTH',
    ].includes(code) ||
    /certificate|self.signed|TLS|SSL/i.test(text)
  ) {
    return new AppError(
      503,
      'forwarding_unavailable',
      'Forwarding is unavailable: the mail server’s filter service (ManageSieve) cannot be reached. Ask your administrator to make sure port 4190 is reachable from the webmail server.',
      { cause: error }
    );
  }
  if (code === 'EQUOTA') {
    return new AppError(
      507,
      'sieve_quota',
      'The mail server has no room for another filter script.',
      {
        cause: error,
      }
    );
  }
  return new AppError(
    502,
    'sieve_rejected',
    `The mail server rejected the forwarding rule${text ? `: ${text}` : '.'}`,
    { cause: error }
  );
}

function sieveOptions() {
  const { sieve } = getConfig();
  return {
    host: sieve.host,
    port: sieve.port,
    requireTLS: sieve.requireTLS,
    rejectUnauthorized: sieve.rejectUnauthorized,
    servername: sieve.servername,
    timeoutMs: sieve.timeoutMs,
  };
}

function describe({ config, scripts, available = true }) {
  const cfg = { ...DEFAULT_FORWARDING, ...(config || {}) };
  const activeScript = scripts.find((s) => s.active)?.name || null;
  const oursActive = activeScript === FORWARDING_SCRIPT_NAME;
  const otherScript =
    activeScript && !oursActive
      ? activeScript
      : cfg.previous && scripts.some((s) => s.name === cfg.previous)
        ? cfg.previous
        : null;
  let state = 'off';
  if (cfg.enabled && cfg.addresses.length) state = oursActive ? 'active' : 'overridden';
  return {
    available,
    enabled: state === 'active',
    state,
    addresses: cfg.addresses,
    keepCopy: cfg.keepCopy,
    skipSpam: cfg.skipSpam,
    otherScript,
    updatedAt: config?.updatedAt || null,
    limits: limits(),
  };
}

/**
 * Reads forwarding for a mailbox from its Sieve scripts.
 * @param {{ user: string, pass: string }} credentials
 * @returns {Promise<ForwardingState>}
 */
export async function readForwarding(credentials) {
  if (!getConfig().sieve.forwardingEnabled) {
    return {
      ...describe({ config: null, scripts: [] }),
      available: false,
      message: 'Mail forwarding has been turned off by your administrator.',
    };
  }
  try {
    return await withManageSieve(sieveOptions(), credentials, async (client) => {
      const scripts = await client.listScripts();
      const ours = scripts.find((s) => s.name === FORWARDING_SCRIPT_NAME);
      const config = ours ? parseForwardingScript(await client.getScript(ours.name)) : null;
      return describe({ config, scripts });
    });
  } catch (error) {
    const mapped = mapSieveError(error);
    if (mapped.code === 'forwarding_unavailable') {
      logger.warn(
        { operation: 'forwarding.read', mailbox: credentials.user, err: serializeError(error) },
        'managesieve unavailable'
      );
      return {
        ...describe({ config: null, scripts: [] }),
        available: false,
        message: mapped.message,
      };
    }
    throw mapped;
  }
}

/**
 * Applies forwarding settings. Never disables the user's other filters:
 * a previously active script is included while forwarding is on and is
 * re-activated when it is turned off.
 *
 * @param {{ user: string, pass: string }} credentials
 * @param {{ enabled: boolean, addresses: string[], keepCopy: boolean, skipSpam: boolean }} input
 * @returns {Promise<ForwardingState>}
 */
export async function writeForwarding(credentials, input) {
  if (!getConfig().sieve.forwardingEnabled) {
    throw errors.forbidden('Mail forwarding has been turned off by your administrator.');
  }
  try {
    return await withManageSieve(sieveOptions(), credentials, async (client) => {
      const extensions = sieveExtensions(client.capabilities);
      const scripts = await client.listScripts();
      const ours = scripts.find((s) => s.name === FORWARDING_SCRIPT_NAME);
      const existing = ours ? parseForwardingScript(await client.getScript(ours.name)) : null;
      const activeScript = scripts.find((s) => s.active)?.name || null;
      const exists = (name) => !!name && scripts.some((s) => s.name === name);

      // Which other script must keep running alongside forwarding.
      let previous = null;
      if (activeScript && activeScript !== FORWARDING_SCRIPT_NAME) previous = activeScript;
      else if (exists(existing?.previous)) previous = existing.previous;

      if (input.enabled) {
        if (input.keepCopy && extensions.size && !extensions.has('copy')) {
          throw errors.badRequest(
            'This mail server cannot forward while keeping a copy. Turn off “Keep a copy” or ask your administrator to enable the Sieve “copy” extension.'
          );
        }
        if (previous && extensions.size && !extensions.has('include')) {
          throw errors.badRequest(
            `Another filter script (“${previous}”) is active and this server cannot combine scripts. Remove it first or ask your administrator to enable the Sieve “include” extension.`
          );
        }
      }

      const script = buildForwardingScript({ ...input, previous });
      await client.putScript(FORWARDING_SCRIPT_NAME, script);

      if (input.enabled) {
        await client.setActive(FORWARDING_SCRIPT_NAME);
      } else if (activeScript === FORWARDING_SCRIPT_NAME) {
        // Hand control back to whatever was active before us (or nothing).
        await client.setActive(previous || '');
      }

      logger.info(
        {
          operation: 'forwarding.write',
          mailbox: credentials.user,
          enabled: input.enabled,
          destinations: input.addresses.length,
          keepCopy: input.keepCopy,
          includes: previous,
        },
        'forwarding updated'
      );

      const after = await client.listScripts();
      return describe({ config: parseForwardingScript(script), scripts: after });
    });
  } catch (error) {
    throw mapSieveError(error);
  }
}

/** Diagnostics: can this mailbox sign in to ManageSieve? */
export async function checkSieve(credentials) {
  const { sieve } = getConfig();
  if (!sieve.enabled || !sieve.forwardingEnabled) return { ok: false, disabled: true };
  const started = Date.now();
  try {
    await withManageSieve(sieveOptions(), credentials, async (client) => client.listScripts());
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, error: mapSieveError(error).message };
  }
}
