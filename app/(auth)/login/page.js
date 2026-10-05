import { Suspense } from 'react';
import Link from 'next/link';
import { getConfig } from '@/lib/config/env';
import { LoginForm } from '@/components/layout/login-form';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  // Showing the mail host is genuinely useful when you run more than one
  // server, and it makes it obvious which mailbox the password belongs to.
  const { imap, provider, app } = getConfig();
  const host = provider === 'mock' ? null : imap.servername || imap.host;

  return (
    <main className="bg-canvas flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <Suspense>
        <LoginForm host={host} />
      </Suspense>
      {app.docsEnabled ? (
        <p className="text-caption text-fg-muted mt-10">
          <Link href="/docs" className="hover:text-fg underline underline-offset-2">
            Documentation
          </Link>
        </p>
      ) : null}
    </main>
  );
}
