import { createHandler, json, readJson } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { folderPath, uidList, str } from '@/lib/api/validate';
import { errors } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

const ACTIONS = new Set([
  'read',
  'unread',
  'star',
  'unstar',
  'archive',
  'trash',
  'delete',
  'spam',
  'notSpam',
  'move',
  'restore',
]);

/**
 * POST /api/mail/actions
 * Body: { action, folder, uids: number[], destination? }
 * Bulk flag / move / delete operations. Supports optimistic UI on the client.
 */
export const POST = createHandler(async ({ session, request, log }) => {
  const body = await readJson(request);
  const action = str(body.action, { name: 'action', max: 20, required: true });
  if (!ACTIONS.has(action)) throw errors.badRequest('Unknown action.');
  const folder = folderPath(body.folder);
  const uids = uidList(body.uids);
  const provider = await getProvider(session);

  let result = { ok: true };
  switch (action) {
    case 'read':
      await provider.markRead(folder, uids, true);
      break;
    case 'unread':
      await provider.markRead(folder, uids, false);
      break;
    case 'star':
      await provider.star(folder, uids, true);
      break;
    case 'unstar':
      await provider.star(folder, uids, false);
      break;
    case 'archive':
      result = await provider.archive(folder, uids);
      break;
    case 'trash':
      result = await provider.deleteMessage(folder, uids, { permanent: false });
      break;
    case 'delete':
      result = await provider.deleteMessage(folder, uids, { permanent: true });
      break;
    case 'spam':
      result = await provider.spam(folder, uids);
      break;
    case 'notSpam':
    case 'restore':
      result = await provider.notSpam(folder, uids);
      break;
    case 'move': {
      const destination = folderPath(body.destination);
      result = await provider.moveMessage(folder, uids, destination);
      break;
    }
    default:
      throw errors.badRequest('Unknown action.');
  }
  logger.debug(
    { operation: 'mail.action', mailbox: session.email, action, folder, count: uids.length },
    'action applied'
  );
  log.debug({ action, count: uids.length }, 'mail action');
  return json({ ok: true, ...result });
});
