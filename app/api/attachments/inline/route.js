import { createHandler } from '@/lib/api/handler';
import { errors } from '@/lib/api/errors';
import { getProvider } from '@/lib/mail';
import { folderPath, int, str } from '@/lib/api/validate';
import { attachmentResponse } from '@/lib/api/stream';

/**
 * GET /api/attachments/inline?folder=&uid=&part=
 *
 * Serves cid: images referenced from HTML email. Only image types are served
 * inline; anything else is refused so this endpoint can never be used to
 * render active content. The viewer iframe is sandboxed without scripts, so
 * the only thing it can do with this endpoint is display the image.
 */
export const GET = createHandler(async ({ session, url }) => {
  const folder = folderPath(url.searchParams.get('folder'));
  const uid = int(url.searchParams.get('uid'), { name: 'uid', min: 1 });
  const part = str(url.searchParams.get('part'), {
    name: 'part',
    max: 40,
    required: true,
    pattern: /^[0-9.]+$/,
  });
  const provider = await getProvider(session);
  const attachment = await provider.getAttachment(folder, uid, part);
  const type = (attachment.meta.contentType || '').toLowerCase();
  if (!/^image\/(png|jpe?g|gif|webp|bmp)$/.test(type)) {
    attachment.release();
    throw errors.notFound('Image not found.');
  }
  return attachmentResponse(attachment, { download: false });
});
