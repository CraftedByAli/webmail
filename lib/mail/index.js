import { getConfig } from '@/lib/config/env';
import { ImapSmtpProvider } from '@/lib/mail/imap-smtp-provider';

/**
 * Provider factory. The active implementation is chosen by MAIL_PROVIDER;
 * only `imap` (default) and `mock` (tests) exist today.
 */

let MockProvider = null;

async function providerClass() {
  const { provider } = getConfig();
  if (provider === 'mock') {
    if (!MockProvider) MockProvider = (await import('@/lib/mail/mock-provider')).MockMailProvider;
    return MockProvider;
  }
  return ImapSmtpProvider;
}

/**
 * Verifies credentials against the mail server.
 * @param {{ user: string, pass: string }} credentials
 */
export async function authenticateMailbox(credentials) {
  const Provider = await providerClass();
  return Provider.authenticate(credentials);
}

/**
 * Returns a provider bound to the session's mailbox.
 * @param {import('@/lib/auth/session').AuthenticatedSession} session
 * @returns {Promise<import('@/lib/mail/provider').MailProvider>}
 */
export async function getProvider(session) {
  const Provider = await providerClass();
  return new Provider(session.credentials);
}
