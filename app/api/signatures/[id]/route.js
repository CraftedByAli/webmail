import { createHandler, json, readJson } from '@/lib/api/handler';
import { updateSignature, deleteSignature } from '@/lib/preferences/signatures';
import { errors } from '@/lib/api/errors';

export const PUT = createHandler(async ({ session, params, request }) => {
  const body = await readJson(request, 128 * 1024);
  return json(updateSignature(session.email, params.id, body));
});

export const DELETE = createHandler(async ({ session, params }) => {
  if (!deleteSignature(session.email, params.id)) throw errors.notFound('Signature not found.');
  return json({ ok: true });
});
