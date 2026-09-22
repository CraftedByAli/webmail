import { createHandler, json } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { folderPath, int, str, bool } from '@/lib/api/validate';
import { getPreferences } from '@/lib/preferences/repository';

/**
 * GET /api/mail/messages?folder=INBOX&page=0&pageSize=50&q=&conversation=1&role=
 * Lists conversations (default) or messages. Only headers are fetched.
 */
export const GET = createHandler(async ({ session, url }) => {
  const prefs = getPreferences(session.email);
  const folder = folderPath(url.searchParams.get('folder') || 'INBOX');
  const page = int(url.searchParams.get('page'), { name: 'page', max: 100000, fallback: 0 });
  const pageSize = int(url.searchParams.get('pageSize'), {
    name: 'pageSize',
    min: 1,
    max: 100,
    fallback: prefs.inbox.pageSize,
  });
  const query = str(url.searchParams.get('q'), { name: 'q', max: 500 });
  const conversation = url.searchParams.has('conversation')
    ? bool(url.searchParams.get('conversation'))
    : prefs.inbox.conversationView;
  const role = str(url.searchParams.get('role'), { name: 'role', max: 20, pattern: /^[a-z]*$/ });

  const provider = await getProvider(session);
  const result = await provider.listMessages(folder, {
    page,
    pageSize,
    query,
    conversation,
    role: role || undefined,
  });
  return json(result);
});
