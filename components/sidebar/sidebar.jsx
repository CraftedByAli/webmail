'use client';

import { useState } from 'react';
import { Pencil, Plus, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderList } from '@/components/sidebar/folder-list';
import { FolderDialog } from '@/components/sidebar/folder-dialog';
import { useFolders } from '@/hooks/use-folders';
import { useComposeStore } from '@/stores/compose-store';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';

export function Sidebar({ mobile = false }) {
  const { data, isLoading, isError, refetch } = useFolders();
  const openCompose = useComposeStore((s) => s.open);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const [dialog, setDialog] = useState(null); // { mode: 'create'|'rename'|'delete', folder? }
  const pathname = usePathname();

  return (
    <nav aria-label="Folders" className="flex h-full flex-col">
      <div className="p-3 pb-2">
        <Button
          variant="compose"
          size="lg"
          className="w-full justify-start gap-3 rounded-2xl px-5"
          onClick={() => {
            setSidebarOpen(false);
            openCompose();
          }}
          data-testid="compose-button"
        >
          <Pencil className="h-4 w-4" /> Compose
        </Button>
      </div>

      <div className="flex-1 scrollbar-thin overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="space-y-2 px-2 pt-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-muted-foreground px-3 pt-3 text-sm">
            Unable to load folders.{' '}
            <button type="button" className="text-primary underline" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        ) : (
          <FolderList
            folders={data.folders}
            roles={data.roles}
            onRename={(f) => setDialog({ mode: 'rename', folder: f })}
            onDelete={(f) => setDialog({ mode: 'delete', folder: f })}
            onCreateChild={(f) => setDialog({ mode: 'create', parent: f })}
          />
        )}

        <div className="mt-3 flex items-center justify-between px-3">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Labels
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Create folder"
            onClick={() => setDialog({ mode: 'create' })}
          >
            <Plus />
          </Button>
        </div>
      </div>

      {mobile ? (
        <div className="border-border border-t p-2">
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
        'hover:bg-muted flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
        active && 'bg-accent text-accent-foreground font-medium'
      )}
    >
      <Icon className="h-4 w-4" /> {children}
    </Link>
  );
}
