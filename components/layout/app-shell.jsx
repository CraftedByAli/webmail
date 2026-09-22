'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { TopBar } from '@/components/layout/top-bar';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ComposeManager } from '@/components/compose/compose-manager';
import { ShortcutsDialog } from '@/components/layout/shortcuts-dialog';
import { useSession } from '@/hooks/use-session';
import { useRealtime } from '@/hooks/use-realtime';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useComposeStore } from '@/stores/compose-store';
import { useUiStore } from '@/stores/ui-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { cn } from '@/utils/cn';

export function AppShell({ user, children }) {
  const { data: session } = useSession();
  const preferences = session?.preferences;
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const openCompose = useComposeStore((s) => s.open);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const { setTheme } = useTheme();
  const [helpOpen, setHelpOpen] = useHelpDialog();

  // Sync theme preference from the server.
  useEffect(() => {
    if (preferences?.appearance?.theme) setTheme(preferences.appearance.theme);
  }, [preferences?.appearance?.theme, setTheme]);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  useRealtime({ enabled: !!session, preferences });

  const shortcutsEnabled = preferences?.shortcuts?.enabled !== false;
  const globalShortcuts = useMemo(
    () => ({
      compose: () => openCompose(),
      goInbox: () => router.push('/mail/inbox'),
      goStarred: () => router.push('/mail/starred'),
      goSent: () => router.push('/mail/sent'),
      goDrafts: () => router.push('/mail/drafts'),
      search: () => document.getElementById('global-search')?.focus(),
      help: () => setHelpOpen(true),
    }),
    [openCompose, router, setHelpOpen]
  );
  useKeyboardShortcuts(globalShortcuts, { enabled: shortcutsEnabled });

  const density = preferences?.appearance?.density === 'compact' ? 'density-compact' : '';

  return (
    <div className={cn('bg-background flex h-dvh flex-col overflow-hidden', density)}>
      <TopBar user={user} isAdmin={session?.user?.isAdmin ?? user.isAdmin} />
      <div className="flex min-h-0 flex-1">
        {isMobile ? (
          <>
            {sidebarOpen ? (
              <button
                type="button"
                aria-label="Close menu"
                className="animate-fade-in fixed inset-0 z-[45] bg-black/40"
                onClick={() => setSidebarOpen(false)}
              />
            ) : null}
            <aside
              className={cn(
                'bg-sidebar shadow-float fixed inset-y-0 left-0 z-[46] w-72 max-w-[85vw] transform transition-transform duration-200',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              )}
              aria-hidden={!sidebarOpen}
            >
              <Sidebar mobile />
            </aside>
          </>
        ) : (
          <aside className="border-border bg-sidebar hidden w-60 shrink-0 border-r md:block lg:w-64">
            <Sidebar />
          </aside>
        )}
        <main id="main" className="bg-background relative flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
      <ComposeManager />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function useHelpDialog() {
  const helpOpen = useUiStore((s) => s.helpOpen || false);
  const set = (open) => useUiStore.setState({ helpOpen: open });
  return [helpOpen, set];
}
