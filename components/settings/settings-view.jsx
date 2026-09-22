'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/utils/cn';
import { GeneralSettings } from '@/components/settings/general-settings';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { InboxSettings } from '@/components/settings/inbox-settings';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { SignatureSettings } from '@/components/settings/signature-settings';
import { ShortcutSettings } from '@/components/settings/shortcut-settings';
import { SecuritySettings } from '@/components/settings/security-settings';
import { AboutSettings } from '@/components/settings/about-settings';
import { useSession } from '@/hooks/use-session';
import { Skeleton } from '@/components/ui/skeleton';

const SECTIONS = [
  ['general', 'General', GeneralSettings],
  ['appearance', 'Appearance', AppearanceSettings],
  ['inbox', 'Inbox', InboxSettings],
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
  const Section = (SECTIONS.find(([k]) => k === current) || SECTIONS[0])[2];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <IconButton label="Back to mail" onClick={() => router.push('/mail/inbox')}>
          <ArrowLeft />
        </IconButton>
        <h1 className="text-base font-semibold">Settings</h1>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Settings sections"
          className="border-border shrink-0 scrollbar-thin overflow-x-auto border-b md:w-56 md:overflow-y-auto md:border-r md:border-b-0"
        >
          <ul className="flex md:flex-col md:p-2">
            {SECTIONS.map(([key, label]) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => router.replace(`/settings?section=${key}`)}
                  aria-current={current === key ? 'page' : undefined}
                  className={cn(
                    'px-4 py-2.5 text-sm whitespace-nowrap md:w-full md:rounded-lg md:text-left',
                    current === key
                      ? 'border-primary text-foreground md:bg-accent md:text-accent-foreground border-b-2 font-medium md:border-b-0'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
            {isPending || !session ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
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
