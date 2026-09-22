'use client';

import { SettingsSection } from '@/components/settings/settings-primitives';

export function AboutSettings({ session }) {
  return (
    <SettingsSection title="About">
      <div className="text-body text-fg-secondary grid gap-3">
        <p>
          <span className="text-fg font-medium">Webmail</span> is a client for your own mail server.
          Messages, folders and search all live on that server — this application stores only your
          preferences, contacts and signatures.
        </p>
        <p>
          Mail is read over IMAP and sent over authenticated SMTP. Deleting this application would
          not touch a single message in your mailbox.
        </p>
        <dl className="text-caption mt-1 grid grid-cols-[7rem_1fr] gap-y-1">
          <dt className="text-fg-muted">Signed in as</dt>
          <dd className="text-fg">{session.user.email}</dd>
        </dl>
      </div>
    </SettingsSection>
  );
}
