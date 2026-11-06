import { createHandler } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { folderPath, int, str, bool } from '@/lib/api/validate';
import { attachmentResponse } from '@/lib/api/stream';

/**
 * GET /api/attachments?folder=&uid=&part=&download=1
 * Streams an attachment. Non-previewable types always download.
 */
export const GET = createHandler(async ({ session, url }) => {
  const folder = folderPath(url.searchParams.get('folder'));
  const uid = int(url.searchParams.get('uid'), { name: 'uid', min: 1 });
  const part = str(url.searchParams.get('part'), {
    name: 'part',
    max: 40,
    required: true,
    pattern: /^[0-9.]+$|^fallback-\d+$/,
  });
  const download = url.searchParams.has('download') ? bool(url.searchParams.get('download')) : true;
  const provider = await getProvider(session);
  const attachment = await provider.getAttachment(folder, uid, part);
  return attachmentResponse(attachment, { download });
});
