'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PenLine, Plus, Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderList } from '@/components/sidebar/folder-list';
import { FolderDialog } from '@/components/sidebar/folder-dialog';
import { SidebarMailboxSwitcher } from '@/components/layout/account-switcher';
import { useFolders } from '@/hooks/use-folders';
import { useComposeStore } from '@/stores/compose-store';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';

/**
 * Primary navigation. Folders come straight from the mail server, so the nav
 * mirrors what the user sees in every other mail client they own.
 */
export function Sidebar({ mobile = false }) {
  const { data, isLoading, isError, refetch } = useFolders();
  const openCompose = useComposeStore((s) => s.open);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const [dialog, setDialog] = useState(null);
  const pathname = usePathname();

  return (
    <nav aria-label="Mail folders" className="bg-canvas flex h-full flex-col">
      <div className="px-2.5 pt-2 pb-1">
        <div className="mb-2">
          <SidebarMailboxSwitcher onNavigate={() => setSidebarOpen(false)} />
        </div>
        <Button
          variant="primary"
          size="lg"
          className="w-full justify-center gap-2"
          onClick={() => {
            setSidebarOpen(false);
            openCompose();
          }}
          data-testid="compose-button"
        >
          <PenLine /> Compose
        </Button>
      </div>

      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-2.5 pt-1 pb-4">
        {isLoading ? (
          <div className="grid gap-1 pt-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-caption text-fg-secondary px-2 pt-3">
            Folders could not be loaded.{' '}
            <button
              type="button"
              className="text-accent-text font-medium underline underline-offset-2"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </p>
        ) : (
          <FolderList
            folders={data.folders}
            roles={data.roles}
            onRename={(f) => setDialog({ mode: 'rename', folder: f })}
            onDelete={(f) => setDialog({ mode: 'delete', folder: f })}
            onCreateChild={(f) => setDialog({ mode: 'create', parent: f })}
            onCreate={() => setDialog({ mode: 'create' })}
          />
        )}
      </div>

      {mobile ? (
        <div className="border-line grid gap-0.5 border-t p-2.5">
          <SidebarLink href="/contacts" icon={Users} active={pathname.startsWith('/contacts')}>
            Contacts
          </SidebarLink>
          <SidebarLink href="/settings" icon={Settings} active={pathname.startsWith('/settings')}>
            Settings
          </SidebarLink>
        </div>
      ) : null}

      <FolderDialog state={dialog} onClose={() => setDialog(null)} />
    </nav>
  );
}

function SidebarLink({ href, icon: Icon, active, children }) {
  return (
    <Link
      href={href}
      className={cn(
        'text-ui rounded-control flex h-7 items-center gap-2.5 px-2 transition-colors duration-100',
        active
          ? 'bg-accent-subtle text-accent-text font-medium'
          : 'text-fg-secondary hover:bg-hover hover:text-fg'
      )}
    >
      <Icon className="size-4" /> {children}
    </Link>
  );
}

export { Plus };
