import { getConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { pruneSessions } from '@/lib/auth/session';
import { cleanupUploads } from '@/lib/mail/attachments';
import { connectionManager } from '@/lib/imap/connection-manager';
import { idleManager } from '@/lib/imap/idle-manager';
import { closeDb } from '@/lib/db';

/**
 * Node-runtime startup: validates configuration, schedules housekeeping and
 * installs graceful shutdown handlers. Loaded from instrumentation.js only
 * when running on the Node.js runtime.
 */
export async function startNodeRuntime() {
  const config = getConfig();
  logger.info(
    {
      operation: 'startup',
      version: config.app.version,
      provider: config.provider,
      imapHost: config.imap.host,
      smtpHost: config.smtp.host,
    },
    'webmail starting'
  );

  const housekeeping = setInterval(async () => {
    try {
      const pruned = pruneSessions();
      const removed = await cleanupUploads();
      if (pruned || removed)
        logger.info({ operation: 'housekeeping', pruned, removed }, 'housekeeping complete');
    } catch (error) {
      logger.warn(
        { operation: 'housekeeping', err: { message: error.message } },
        'housekeeping failed'
      );
    }
  }, 15 * 60_000);
  housekeeping.unref();

  const shutdown = async (signal) => {
    logger.info({ operation: 'shutdown', signal }, 'shutting down');
    clearInterval(housekeeping);
    try {
      await Promise.race([
        Promise.all([idleManager.shutdown(), connectionManager.shutdown()]),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
      closeDb();
    } catch {
      // best effort
    }
    process.exit(0);
  };

  const globalKey = Symbol.for('webmail.shutdownHooked');
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = true;
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  }
}
