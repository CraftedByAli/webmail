import nodemailer from 'nodemailer';
import { getConfig } from '@/lib/config/env';
import { logger, serializeError } from '@/lib/logger';
import { mapMailError } from '@/lib/api/errors';

/**
 * SMTP service. Always connects to the configured Mailcow submission port with
 * the signed-in mailbox's own credentials; users can never point the app at
 * another server or send as a different account.
 */

function createTransport(credentials) {
  const { smtp } = getConfig();
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    servername: smtp.servername,
    requireTLS: !smtp.secure && smtp.requireTLS,
    auth: { user: credentials.user, pass: credentials.pass },
    tls: { rejectUnauthorized: smtp.rejectUnauthorized, minVersion: 'TLSv1.2' },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
    logger: false,
  });
}

/**
 * Sends a pre-built RFC822 message.
 * @param {{ user: string, pass: string }} credentials
 * @param {{ raw: Buffer, envelope: { from: string, to: string[] } }} message
 */
export async function sendRawMessage(credentials, message) {
  const transport = createTransport(credentials);
  const started = Date.now();
  try {
    const info = await transport.sendMail({ envelope: message.envelope, raw: message.raw });
    logger.info(
      {
        operation: 'smtp.send',
        mailbox: credentials.user,
        durationMs: Date.now() - started,
        accepted: info.accepted?.length,
        rejected: info.rejected?.length,
      },
      'message sent'
    );
    if (info.rejected && info.rejected.length && (!info.accepted || info.accepted.length === 0)) {
      const err = new Error('All recipients were rejected by the mail server');
      err.responseCode = 550;
      throw err;
    }
    return {
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    };
  } catch (error) {
    logger.error(
      {
        operation: 'smtp.send',
        mailbox: credentials.user,
        durationMs: Date.now() - started,
        err: serializeError(error),
      },
      'smtp send failed'
    );
    throw mapMailError(error);
  } finally {
    transport.close();
  }
}

/** Verifies SMTP connectivity and authentication (diagnostics). */
export async function verifySmtp(credentials) {
  const transport = createTransport(credentials);
  const started = Date.now();
  try {
    await transport.verify();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, error: mapMailError(error).message };
  } finally {
    transport.close();
  }
}
