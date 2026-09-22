import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getConfig } from '@/lib/config/env';
import { resolveSession } from '@/lib/auth/session';
import { AppShell } from '@/components/layout/app-shell';

export const dynamic = 'force-dynamic';

/**
 * Authenticated area. The proxy only checks that a cookie exists; this layout
 * validates the session for real and redirects when it is invalid.
 */
export default async function MailLayout({ children }) {
  const { session: sessionConfig, app } = getConfig();
  const token = (await cookies()).get(sessionConfig.cookieName)?.value;
  const session = resolveSession(token);
  if (!session) redirect('/login?reason=expired');

  return (
    <AppShell user={{ email: session.email, isAdmin: app.adminEmails.includes(session.email) }}>
      {children}
    </AppShell>
  );
}
