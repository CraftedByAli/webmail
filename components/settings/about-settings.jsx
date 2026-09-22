'use client';

import { SettingsSection } from '@/components/settings/settings-primitives';

export function AboutSettings() {
  return (
    <SettingsSection title="About">
      <div className="space-y-2 px-4 py-3 text-sm">
        <p>
          <span className="font-medium">Webmail</span> — a Gmail-style client for Mailcow mailboxes.
        </p>
        <p className="text-muted-foreground">
          Mail is read over IMAP and sent over SMTP through your Mailcow server. Nothing is stored
          here except your preferences, contacts and signatures.
        </p>
        <p className="text-muted-foreground">Built with Next.js, React and Tailwind CSS.</p>
      </div>
    </SettingsSection>
  );
}
