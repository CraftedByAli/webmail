import { createHandler, json } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { folderPath, int, bool } from '@/lib/api/validate';
import { getPreferences } from '@/lib/preferences/repository';

/**
 * GET /api/mail/messages/:uid?folder=INBOX&images=0&markRead=1
 * Loads a single message body (sanitized) and attachment metadata.
 */
export const GET = createHandler(async ({ session, url, params }) => {
  const uid = int(params.uid, { name: 'uid', min: 1 });
  const folder = folderPath(url.searchParams.get('folder') || 'INBOX');
  const prefs = getPreferences(session.email);
  const allowExternalImages = url.searchParams.has('images')
    ? bool(url.searchParams.get('images'))
    : prefs.inbox.autoLoadImages;
  const markRead = url.searchParams.has('markRead') ? bool(url.searchParams.get('markRead')) : true;

  const provider = await getProvider(session);
  const message = await provider.getMessage(folder, uid, {
    allowExternalImages,
    sessionId: session.id,
    markRead,
  });
  return json(message);
});
