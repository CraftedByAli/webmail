import { createHandler, json } from '@/lib/api/handler';
import { getPreferences } from '@/lib/preferences/repository';
import { listSignatures } from '@/lib/preferences/signatures';
import { getConfig } from '@/lib/config/env';

/** GET /api/auth/session — the active mailbox, its preferences and signatures. */
export const GET = createHandler(async ({ session }) => {
  const { app } = getConfig();
  return json({
    user: { email: session.email, isAdmin: app.adminEmails.includes(session.email) },
    session: { id: session.id, createdAt: session.createdAt, expiresAt: session.expiresAt },
    accounts: session.accounts.map((a) => a.email),
    preferences: getPreferences(session.email),
    signatures: listSignatures(session.email),
  });
});
