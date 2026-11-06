'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { TopBar } from '@/components/layout/top-bar';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ComposeManager } from '@/components/compose/compose-manager';
import { ShortcutsDialog } from '@/components/layout/shortcuts-dialog';
import { useSession } from '@/hooks/use-session';
import { AccountProvider, AccountScope } from '@/components/layout/account-provider';
import { AddMailboxDialog } from '@/components/layout/account-switcher';
import { useAccountActions } from '@/hooks/use-accounts';
import { useAccountStore } from '@/stores/account-store';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useComposeStore } from '@/stores/compose-store';
import { useUiStore } from '@/stores/ui-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { cn } from '@/utils/cn';

export function AppShell({ user, accounts, maxAccounts, children }) {
  return (
    <AccountProvider
      accounts={accounts || [{ email: user.email, isAdmin: user.isAdmin }]}
      initialActive={user.email}
      maxAccounts={maxAccounts}
    >
      <ShellFrame>{children}</ShellFrame>
    </AccountProvider>
  );
}

function ShellFrame({ children }) {
  const active = useAccountStore((s) => s.active);
  const accounts = useAccountStore((s) => s.accounts);
  const account = accounts.find((a) => a.email === active) || accounts[0];
  if (!account) return null;
  return (
    <>
      <AccountScope key={account.email} account={account.email}>
        <MailboxShell user={{ email: account.email, isAdmin: !!account.isAdmin }}>
          {children}
        </MailboxShell>
      </AccountScope>
      {/* Outside the mailbox scope: each draft stays bound to its own mailbox. */}
      <ComposeManager />
      <AddMailboxDialog />
    </>
  );
}

function MailboxShell({ user, children }) {
  const { data: session } = useSession();
  const { switchTo } = useAccountActions();
  const preferences = session?.preferences;
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const openCompose = useComposeStore((s) => s.open);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const helpOpen = useUiStore((s) => s.helpOpen || false);
  const { setTheme } = useTheme();

  useEffect(() => {
    if (preferences?.appearance?.theme) setTheme(preferences.appearance.theme);
  }, [preferences?.appearance?.theme, setTheme]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  const shortcutsEnabled = preferences?.shortcuts?.enabled !== false;
  const globalShortcuts = useMemo(
    () => ({
      compose: () => openCompose(),
      goInbox: () => router.push('/mail/inbox'),
      goStarred: () => router.push('/mail/starred'),
      goSent: () => router.push('/mail/sent'),
      goDrafts: () => router.push('/mail/drafts'),
      search: () => document.getElementById('global-search')?.focus(),
      help: () => useUiStore.setState({ helpOpen: true }),
      switchMailbox: (n) => {
        const target = useAccountStore.getState().accounts[n - 1];
        if (target) switchTo(target.email);
      },
    }),
    [openCompose, router, switchTo]
  );
  useKeyboardShortcuts(globalShortcuts, { enabled: shortcutsEnabled });

  return (
    <div
      className={cn(
        'bg-canvas flex h-dvh flex-col overflow-hidden',
        preferences?.appearance?.density === 'compact' && 'density-compact'
      )}
    >
      <a
        href="#main"
        className="focus:bg-accent focus:text-ui focus:text-on-accent focus:rounded-control sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <TopBar user={user} isAdmin={session?.user?.isAdmin ?? user.isAdmin} />

      <div className="flex min-h-0 flex-1">
        {isMobile ? (
          <>
            {sidebarOpen ? (
              <button
                type="button"
                aria-label="Close folder menu"
                className="fixed inset-0 z-[45] bg-black/40"
                onClick={() => setSidebarOpen(false)}
              />
            ) : null}
            <aside
              className={cn(
                'border-line bg-canvas safe-top safe-bottom fixed inset-y-0 left-0 z-[46] w-[17rem] max-w-[85vw] transform border-r transition-transform duration-200 ease-out',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              )}
              aria-hidden={!sidebarOpen}
              inert={!sidebarOpen || undefined}
            >
              <Sidebar mobile />
            </aside>
          </>
        ) : (
          <aside className="border-line hidden w-[var(--rail-w)] shrink-0 border-r md:block">
            <Sidebar />
          </aside>
        )}

        <main id="main" className="bg-surface relative flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>

      <ShortcutsDialog
        open={helpOpen}
        onOpenChange={(open) => useUiStore.setState({ helpOpen: open })}
      />
    </div>
  );
}
