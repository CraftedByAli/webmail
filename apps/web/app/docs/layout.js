import { notFound } from 'next/navigation';
import { getConfig } from '@/lib/config/env';
import { DocsShell } from '@/components/docs/docs-shell';

export const metadata = {
  title: { default: 'Documentation', template: '%s · OsmicMails docs' },
  description:
    'Self-host OsmicMails, the multi-mailbox webmail for Mailcow: installation, Mailcow integration, configuration and security.',
};

/** Public: no session required. Operators can turn it off with DOCS_ENABLED=false. */
export default function DocsLayout({ children }) {
  if (!getConfig().app.docsEnabled) notFound();
  return <DocsShell>{children}</DocsShell>;
}
