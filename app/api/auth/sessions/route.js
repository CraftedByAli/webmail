import { createHandler, json, readJson } from '@/lib/api/handler';
import { listSessions, revokeSession, getLoginHistory } from '@/lib/auth/session';
import { errors } from '@/lib/api/errors';

/** GET /api/auth/sessions — active sessions + recent login history. */
export const GET = createHandler(async ({ session }) => {
  const sessions = listSessions(session.email).map((s) => ({ ...s, current: s.id === session.id }));
  return json({ sessions, loginHistory: getLoginHistory(session.email, 10) });
});

/** DELETE /api/auth/sessions — body { id } revokes one session. */
export const DELETE = createHandler(async ({ session, request }) => {
  const body = await readJson(request);
  const id = String(body.id || '');
  if (!id) throw errors.badRequest();
  const ok = revokeSession(id, session.email);
  if (!ok) throw errors.notFound('Session not found.');
  return json({ ok: true, current: id === session.id });
});
