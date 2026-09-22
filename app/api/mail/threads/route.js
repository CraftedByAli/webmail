import { createHandler, json } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { folderPath, uidList } from '@/lib/api/validate';

/** GET /api/mail/threads?folder=INBOX&uids=1,2,3 — loads a conversation. */
export const GET = createHandler(async ({ session, url }) => {
  const folder = folderPath(url.searchParams.get('folder') || 'INBOX');
  const uids = uidList(url.searchParams.get('uids'), { max: 200 });
  const provider = await getProvider(session);
  const thread = await provider.getThread(folder, uids);
  return json(thread);
});
