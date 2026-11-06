import { createHandler, json, readJson } from '@/lib/api/handler';
import { getPreferences, updatePreferences } from '@/lib/preferences/repository';

export const GET = createHandler(async ({ session }) => json(getPreferences(session.email)));

export const PATCH = createHandler(async ({ session, request }) => {
  const patch = await readJson(request, 64 * 1024);
  return json(updatePreferences(session.email, patch));
});
