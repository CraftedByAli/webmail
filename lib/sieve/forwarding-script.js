/**
 * Builds and reads the Sieve script that implements per-mailbox forwarding.
 *
 * The script is the single source of truth: its settings are embedded as a
 * JSON comment, so forwarding survives app reinstalls, works from any device
 * and runs on the mail server even when nobody is signed in.
 *
 * A mailbox can only have one active Sieve script. If another script was
 * already active (filters or a vacation reply made in SOGo, Roundcube …) it
 * is kept running by including it after the forwarding rules, and it is
 * re-activated when forwarding is turned off.
 */

export const FORWARDING_SCRIPT_NAME = 'osmicmails-forwarding';
const CONFIG_PREFIX = '# osmicmails-forwarding-config: ';

/**
 * @typedef {Object} ForwardingConfig
 * @property {boolean} enabled
 * @property {string[]} addresses
 * @property {boolean} keepCopy   keep a copy in this mailbox (redirect :copy)
 * @property {boolean} skipSpam   do not forward messages flagged as spam
 * @property {string|null} [previous] script that was active before ours
 */

export const DEFAULT_FORWARDING = Object.freeze({
  enabled: false,
  addresses: [],
  keepCopy: true,
  skipSpam: true,
  previous: null,
});

/** Escapes a value for a Sieve quoted string (RFC 5228 §2.4.2). */
export function sieveString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * @param {ForwardingConfig} config
 * @param {{ updatedAt?: number }} [meta]
 * @returns {string}
 */
export function buildForwardingScript(config, meta = {}) {
  const cfg = { ...DEFAULT_FORWARDING, ...config };
  const addresses = [...new Set(cfg.addresses)];
  const active = cfg.enabled && addresses.length > 0;
  const stored = {
    v: 1,
    enabled: !!cfg.enabled,
    addresses,
    keepCopy: !!cfg.keepCopy,
    skipSpam: !!cfg.skipSpam,
    previous: cfg.previous || null,
    updatedAt: meta.updatedAt || Date.now(),
  };

  const requires = [];
  if (active && cfg.keepCopy) requires.push('copy');
  if (cfg.previous) requires.push('include');

  const lines = [
    '# OsmicMails — mail forwarding for this mailbox.',
    '# Managed by OsmicMails (Settings → Forwarding). Manual edits will be overwritten.',
    `${CONFIG_PREFIX}${JSON.stringify(stored)}`,
  ];
  if (requires.length) lines.push(`require [${requires.map(sieveString).join(', ')}];`);
  lines.push('');

  if (active) {
    const redirect = (a) => `redirect${cfg.keepCopy ? ' :copy' : ''} ${sieveString(a)};`;
    if (cfg.skipSpam) {
      // Mailcow/rspamd mark spam with X-Spam-Flag: YES (and X-Spam: Yes).
      // Forwarding spam would hurt the domain's sending reputation.
      lines.push(
        'if not anyof (header :contains "X-Spam-Flag" "YES", header :contains "X-Spam" "Yes") {'
      );
      for (const a of addresses) lines.push(`  ${redirect(a)}`);
      lines.push('}');
    } else {
      for (const a of addresses) lines.push(redirect(a));
    }
  } else {
    lines.push('# Forwarding is turned off.');
  }

  if (cfg.previous) {
    lines.push('');
    lines.push('# Keep running the filters that were active before forwarding was set up.');
    lines.push(`include :personal :optional ${sieveString(cfg.previous)};`);
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Reads the settings embedded in one of our scripts. Returns null for any
 * other script (or a damaged comment).
 * @param {string | null | undefined} script
 * @returns {(ForwardingConfig & { updatedAt: number | null }) | null}
 */
export function parseForwardingScript(script) {
  if (!script) return null;
  const line = script.split(/\r?\n/).find((l) => l.startsWith(CONFIG_PREFIX));
  if (!line) return null;
  try {
    const data = JSON.parse(line.slice(CONFIG_PREFIX.length));
    if (!data || typeof data !== 'object') return null;
    return {
      enabled: !!data.enabled,
      addresses: Array.isArray(data.addresses)
        ? data.addresses.filter((a) => typeof a === 'string')
        : [],
      keepCopy: data.keepCopy !== false,
      skipSpam: data.skipSpam !== false,
      previous: typeof data.previous === 'string' && data.previous ? data.previous : null,
      updatedAt: Number(data.updatedAt) || null,
    };
  } catch {
    return null;
  }
}
