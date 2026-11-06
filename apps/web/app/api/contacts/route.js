import { createHandler, json, readJson } from '@/lib/api/handler';
import { listContacts, createContact } from '@/lib/contacts/repository';
import { str } from '@/lib/api/validate';

export const GET = createHandler(async ({ session, url }) => {
  const q = str(url.searchParams.get('q'), { max: 200 });
  return json({ contacts: listContacts(session.email, { q }) });
});

export const POST = createHandler(async ({ session, request }) => {
  const body = await readJson(request);
  return json(createContact(session.email, body), { status: 201 });
});
