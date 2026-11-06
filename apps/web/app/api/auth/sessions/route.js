import { NextResponse } from 'next/server';
import { createHandler, json, readJson } from '@/lib/api/handler';
import {
  listSessions,
  listSessionAccounts,
  revokeSession,
  getLoginHistory,
} from '@/lib/auth/session';
import { serializeClearedSessionCookie } from '@/lib/auth/cookies';
import { errors } from '@/lib/api/errors';

/** GET /api/auth/sessions — devices the current mailbox is signed in on + login history. */
export const GET = createHandler(async ({ session }) => {
  const sessions = listSessions(session.email).map((s) => ({ ...s, current: s.id === session.id }));
  return json({ sessions, loginHistory: getLoginHistory(session.email, 10) });
});

/**
 * DELETE /api/auth/sessions — body { id } signs the current mailbox out of
 * that device. Other mailboxes on that device are not affected.
 */
export const DELETE = createHandler(async ({ session, request }) => {
  const body = await readJson(request);
  const id = String(body.id || '');
  if (!id) throw errors.badRequest();
  const ok = revokeSession(id, session.email);
  if (!ok) throw errors.notFound('Session not found.');
  const current = id === session.id;
  const signedOut = current && listSessionAccounts(session.id).length === 0;
  const response = NextResponse.json({ ok: true, current, signedOut });
  if (signedOut) response.headers.append('Set-Cookie', serializeClearedSessionCookie());
  return response;
});
