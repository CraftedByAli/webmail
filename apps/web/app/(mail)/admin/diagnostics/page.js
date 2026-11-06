import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getConfig } from '@/lib/config/env';
import { resolveSession } from '@/lib/auth/session';
import { DiagnosticsView } from '@/components/settings/diagnostics-view';

export const metadata = { title: 'Diagnostics' };
export const dynamic = 'force-dynamic';

export default async function DiagnosticsPage() {
  const { session: sessionConfig, app } = getConfig();
  const jar = await cookies();
  const session = resolveSession(jar.get(sessionConfig.cookieName)?.value, {
    preferred: jar.get(sessionConfig.accountCookieName)?.value || null,
  });
  if (!session) redirect('/login');
  if (!app.adminEmails.includes(session.email)) redirect('/mail/inbox');
  return <DiagnosticsView />;
}
