'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';
import { GeneralSettings } from '@/components/settings/general-settings';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { InboxSettings } from '@/components/settings/inbox-settings';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { SignatureSettings } from '@/components/settings/signature-settings';
import { ShortcutSettings } from '@/components/settings/shortcut-settings';
import { SecuritySettings } from '@/components/settings/security-settings';
import { AboutSettings } from '@/components/settings/about-settings';
import { MailboxSettings } from '@/components/settings/mailbox-settings';
import { ForwardingSettings } from '@/components/settings/forwarding-settings';
import { useSession } from '@/hooks/use-session';

const SECTIONS = [
  ['general', 'General', GeneralSettings],
  ['mailboxes', 'Mailboxes', MailboxSettings],
  ['forwarding', 'Forwarding', ForwardingSettings],
  ['appearance', 'Appearance', AppearanceSettings],
  ['inbox', 'Reading', InboxSettings],
  ['notifications', 'Notifications', NotificationSettings],
  ['signatures', 'Signatures', SignatureSettings],
  ['shortcuts', 'Keyboard shortcuts', ShortcutSettings],
  ['security', 'Security & sessions', SecuritySettings],
  ['about', 'About', AboutSettings],
];

export function SettingsView() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('section') || 'general';
  const { data: session, isPending } = useSession();
  const entry = SECTIONS.find(([k]) => k === current) || SECTIONS[0];
  const Section = entry[2];

  return (
    <div className="bg-surface flex h-full min-h-0 flex-col">
      <div
        data-chrome
        className="border-line bg-canvas px-gutter flex h-11 shrink-0 items-center gap-1 border-b"
      >
        <IconButton label="Back to mail" onClick={() => router.push('/mail/inbox')}>
          <ArrowLeft />
        </IconButton>
        <h1 className="text-title text-fg min-w-0 truncate font-semibold">
          Settings
          {session?.user?.email ? (
            <span className="text-fg-muted font-normal"> · {session.user.email}</span>
          ) : null}
        </h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Settings sections"
          className="border-line shrink-0 scrollbar-thin overflow-x-auto border-b md:w-56 md:overflow-y-auto md:border-r md:border-b-0"
        >
          <ul className="flex md:flex-col md:gap-px md:p-2.5">
            {SECTIONS.map(([key, label]) => {
              const active = current === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => router.replace(`/settings?section=${key}`)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'text-ui md:rounded-control px-4 py-2.5 whitespace-nowrap transition-colors duration-100 md:h-7 md:w-full md:px-2 md:py-0 md:text-left',
                      active
                        ? 'border-accent text-fg md:bg-accent-subtle md:text-accent-text border-b-2 font-medium md:border-b-0'
                        : 'text-fg-secondary hover:text-fg md:hover:bg-hover'
                    )}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
          <div className="px-gutter mx-auto max-w-2xl py-7">
            {isPending || !session ? (
              <div className="grid gap-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-72" />
                <Skeleton className="mt-4 h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <Section session={session} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
