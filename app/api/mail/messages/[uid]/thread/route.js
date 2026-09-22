import { createHandler, json } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { folderPath, int } from '@/lib/api/validate';

/** GET /api/mail/messages/:uid/thread?folder= — the conversation containing a message. */
export const GET = createHandler(async ({ session, url, params }) => {
  const uid = int(params.uid, { name: 'uid', min: 1 });
  const folder = folderPath(url.searchParams.get('folder') || 'INBOX');
  const provider = await getProvider(session);
  const uids = await provider.findThreadUids(folder, uid);
  const thread = await provider.getThread(folder, uids);
  return json(thread);
});
