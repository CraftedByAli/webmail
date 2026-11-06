import { createHandler, json, readJson } from '@/lib/api/handler';
import { errors } from '@/lib/api/errors';
import { storeUpload, deleteUpload, cleanupUploads } from '@/lib/mail/attachments';
import { getConfig } from '@/lib/config/env';
import { str } from '@/lib/api/validate';

/**
 * POST /api/attachments/upload — multipart/form-data with a single `file`.
 * Streams the file to temporary storage and returns its id for compose.
 */
export const POST = createHandler(
  async ({ session, request }) => {
    const { maxAttachmentBytes } = getConfig().limits;
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > maxAttachmentBytes + 64 * 1024) {
      throw errors.tooLarge(
        `Attachments must be smaller than ${Math.round(maxAttachmentBytes / 1024 / 1024)} MB.`
      );
    }
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data'))
      throw errors.badRequest('Expected a file upload.');

    let form;
    try {
      form = await request.formData();
    } catch {
      throw errors.badRequest('Could not read the uploaded file.');
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw errors.badRequest('No file provided.');

    const meta = await storeUpload(session.id, {
      name: file.name,
      declaredType: file.type,
      size: file.size,
      stream: file.stream(),
    });
    if (Math.random() < 0.05) cleanupUploads().catch(() => {});
    return json(meta, { status: 201 });
  },
  { rateLimit: 'upload' }
);

/** DELETE /api/attachments/upload — body { id } removes a pending upload. */
export const DELETE = createHandler(async ({ session, request }) => {
  const body = await readJson(request);
  const id = str(body.id, { name: 'id', max: 64, required: true, pattern: /^[a-f0-9]{32}$/ });
  await deleteUpload(session.id, id);
  return json({ ok: true });
});
