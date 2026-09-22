import { createHandler, json, readJson } from '@/lib/api/handler';
import { updateContact, deleteContact, getContact } from '@/lib/contacts/repository';
import { errors } from '@/lib/api/errors';

export const GET = createHandler(async ({ session, params }) => {
  const contact = getContact(session.email, params.id);
  if (!contact) throw errors.notFound('Contact not found.');
  return json(contact);
});

export const PUT = createHandler(async ({ session, params, request }) => {
  const body = await readJson(request);
  return json(updateContact(session.email, params.id, body));
});

export const DELETE = createHandler(async ({ session, params }) => {
  const ok = deleteContact(session.email, params.id);
  if (!ok) throw errors.notFound('Contact not found.');
  return json({ ok: true });
});
