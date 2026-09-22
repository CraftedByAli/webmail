import { createHandler, json } from '@/lib/api/handler';
import { errors } from '@/lib/api/errors';
import { getConfig } from '@/lib/config/env';
import { getProvider } from '@/lib/mail';
import { connectionManager } from '@/lib/imap/connection-manager';
import { idleManager } from '@/lib/imap/idle-manager';
import { realtimeHub } from '@/lib/realtime/hub';

/**
 * GET /api/admin/diagnostics — operational status for administrators.
 * Requires the signed-in mailbox to be listed in ADMIN_EMAILS.
 */
export const GET = createHandler(async ({ session }) => {
  const config = getConfig();
  if (!config.app.adminEmails.includes(session.email)) throw errors.forbidden();

  const provider = await getProvider(session);
  const status = await provider.status();
  return json({
    version: config.app.version,
    environment: process.env.NODE_ENV || 'development',
    provider: config.provider,
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    imap: {
      host: config.imap.host,
      port: config.imap.port,
      tls: config.imap.tls,
      ...status.imap,
      pool: connectionManager.stats(),
      idle: idleManager.status(session.email),
    },
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      requireTLS: config.smtp.requireTLS,
      ...status.smtp,
    },
    realtime: { subscribers: realtimeHub.subscriberCount(session.email) },
    limits: config.limits,
  });
});
