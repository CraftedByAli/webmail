import { createHandler, json } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { folderPath, int, str, bool } from '@/lib/api/validate';
import { parseSearchQuery } from '@/lib/search/query-parser';
import { getPreferences } from '@/lib/preferences/repository';

/**
 * GET /api/search?q=from:john has:attachment&folder=INBOX&page=0
 * Search is executed by the SearchService abstraction (IMAP SEARCH today).
 */
export const GET = createHandler(async ({ session, url }) => {
  const prefs = getPreferences(session.email);
  const q = str(url.searchParams.get('q'), { name: 'q', max: 500 });
  const folder = folderPath(url.searchParams.get('folder') || 'INBOX');
  const page = int(url.searchParams.get('page'), { name: 'page', max: 100000, fallback: 0 });
  const pageSize = int(url.searchParams.get('pageSize'), {
    name: 'pageSize',
    min: 1,
    max: 100,
    fallback: prefs.inbox.pageSize,
  });
  const conversation = url.searchParams.has('conversation')
    ? bool(url.searchParams.get('conversation'))
    : prefs.inbox.conversationView;
  const provider = await getProvider(session);
  const result = await provider.search(q, { folder, page, pageSize, conversation });
  return json({ ...result, parsed: parseSearchQuery(q) });
});
