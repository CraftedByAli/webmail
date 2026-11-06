import { createHandler, json, readJson } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { parseComposePayload } from '@/app/api/mail/send/route';
import { getPreferences } from '@/lib/preferences/repository';
import { int } from '@/lib/api/validate';

/**
 * POST /api/drafts — saves a draft. Body: compose payload + { draftUid? }.
 * Replaces the previous draft (identified by draftUid) so autosave never
 * accumulates duplicates.
 */
export const POST = createHandler(async ({ session, request }) => {
  const body = await readJson(request, 6 * 1024 * 1024);
  const payload = parseComposePayload(body);
  const prefs = getPreferences(session.email);
  const provider = await getProvider(session);
  const result = await provider.saveDraft(payload, payload.draftUid, {
    sessionId: session.id,
    fromName: prefs.general.displayName,
  });
  return json(result);
});

/** DELETE /api/drafts — body { uid } discards a draft. */
export const DELETE = createHandler(async ({ session, request }) => {
  const body = await readJson(request);
  const uid = int(body.uid, { name: 'uid', min: 1 });
  const provider = await getProvider(session);
  await provider.deleteDraft(uid);
  return json({ ok: true });
});
