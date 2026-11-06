import { createHandler, json, readJson } from '@/lib/api/handler';
import { listSignatures, createSignature } from '@/lib/preferences/signatures';

export const GET = createHandler(async ({ session }) =>
  json({ signatures: listSignatures(session.email) })
);

export const POST = createHandler(async ({ session, request }) => {
  const body = await readJson(request, 128 * 1024);
  return json(createSignature(session.email, body), { status: 201 });
});
