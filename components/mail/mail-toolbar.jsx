'use client';

import {
  RefreshCw,
  Archive,
  Trash2,
  ShieldAlert,
  MailOpen,
  Mail,
  FolderInput,
  Star,
  ChevronDown,
  Inbox,
  Menu,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MoveMenu } from '@/components/mail/move-menu';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';

export function MailToolbar({
  title,
  route,
  folder,
  roles,
  folders,
  items,
  total,
  loaded,
  selectedCount,
  allSelected,
  onSelectAll,
  onRefresh,
  refreshing,
  onArchive,
  onTrash,
  onDeleteForever,
  onSpam,
  onNotSpam,
  onRead,
  onUnread,
  onMove,
  onStar,
}) {
  const selectMany = useUiStore((s) => s.selectMany);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const hasSelection = selectedCount > 0;
  const isTrash = folder === roles?.trash;
  const isJunk = folder === roles?.junk;
  const isDrafts = route.role === 'drafts';

  return (
    <div className="border-border flex h-12 shrink-0 items-center gap-1 border-b px-2 sm:px-3">
      <IconButton label="Open menu" className="md:hidden" onClick={toggleSidebar} tooltip={false}>
        <Menu />
      </IconButton>
      <div className="hidden items-center sm:flex">
        <Checkbox
          checked={allSelected ? true : hasSelection ? 'indeterminate' : false}
          onCheckedChange={(v) => onSelectAll(v === true)}
          aria-label="Select all"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Selection options"
              className="text-muted-foreground hover:text-foreground rounded p-0.5"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => selectMany(items.map((i) => i.id))}>
              All loaded
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => clearSelection()}>None</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                selectMany(
                  items
                    .filter((i) => (i.type === 'thread' ? i.unread : !i.flags.seen))
                    .map((i) => i.id)
                )
              }
            >
              Unread
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                selectMany(
                  items
                    .filter((i) => (i.type === 'thread' ? !i.unread : i.flags.seen))
                    .map((i) => i.id)
                )
              }
            >
              Read
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                selectMany(
                  items
                    .filter((i) => (i.type === 'thread' ? i.starred : i.flags.flagged))
                    .map((i) => i.id)
                )
              }
            >
              Starred
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasSelection ? (
        <div
          className="animate-fade-in flex items-center gap-0.5"
          role="toolbar"
          aria-label="Bulk actions"
        >
          {!isTrash && !isDrafts ? (
            <IconButton label="Archive" shortcut="e" onClick={onArchive}>
              <Archive />
            </IconButton>
          ) : null}
          {isJunk ? (
            <IconButton label="Not spam" onClick={onNotSpam}>
              <Inbox />
            </IconButton>
          ) : !isDrafts ? (
            <IconButton label="Report spam" shortcut="!" onClick={onSpam}>
              <ShieldAlert />
            </IconButton>
          ) : null}
          {isTrash ? (
            <>
              <IconButton label="Move to Inbox" onClick={onNotSpam}>
                <Inbox />
              </IconButton>
              <IconButton label="Delete forever" onClick={onDeleteForever}>
                <Trash2 />
              </IconButton>
            </>
          ) : (
            <IconButton label="Delete" shortcut="#" onClick={onTrash}>
              <Trash2 />
            </IconButton>
          )}
          <span className="bg-border mx-1 h-5 w-px" />
          <IconButton label="Mark as read" shortcut="⇧I" onClick={onRead}>
            <MailOpen />
          </IconButton>
          <IconButton label="Mark as unread" shortcut="⇧U" onClick={onUnread}>
            <Mail />
          </IconButton>
          <IconButton label="Star" shortcut="s" onClick={onStar}>
            <Star />
          </IconButton>
          <MoveMenu folders={folders} currentFolder={folder} onMove={onMove}>
            <IconButton label="Move to">
              <FolderInput />
            </IconButton>
          </MoveMenu>
          <span className="text-muted-foreground ml-2 text-sm">{selectedCount} selected</span>
        </div>
      ) : (
        <>
          <h1 className={cn('truncate px-1 text-base font-semibold sm:px-2')}>{title}</h1>
          <IconButton label="Refresh" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
          </IconButton>
        </>
      )}

      <div className="text-muted-foreground ml-auto hidden items-center gap-2 text-xs sm:flex">
        {total > 0 ? (
          <span aria-live="polite">
            1–{Math.min(loaded, total)} of {total.toLocaleString()}
          </span>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto sm:hidden"
        onClick={onSelectAll.bind(null, !allSelected)}
        aria-label={allSelected ? 'Deselect all' : 'Select all'}
      >
        {allSelected ? 'None' : 'Select'}
      </Button>
    </div>
  );
}
