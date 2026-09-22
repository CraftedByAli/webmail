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
  PanelLeft,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDivider } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoveMenu } from '@/components/mail/move-menu';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';

/**
 * A single action bar, not a stack of headers.
 *
 * It has two modes that occupy the same 44px: browsing (title + count) and
 * selection (bulk actions + count). Switching modes in place keeps the list
 * from shifting vertically when the user checks a box.
 */
export function MailToolbar({
  title,
  subtitle,
  route,
  folder,
  roles,
  folders,
  items,
  total,
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
    <div
      data-chrome
      className="border-line bg-canvas px-gutter flex h-11 shrink-0 items-center gap-1 border-b"
    >
      <IconButton
        label="Show folders"
        className="md:hidden"
        onClick={toggleSidebar}
        tooltip={false}
      >
        <PanelLeft />
      </IconButton>

      <div className="flex shrink-0 items-center gap-0.5 pr-1">
        <span className="hidden sm:block">
          <Checkbox
            checked={allSelected ? true : hasSelection ? 'indeterminate' : false}
            onCheckedChange={(v) => onSelectAll(v === true)}
            aria-label={allSelected ? 'Deselect all conversations' : 'Select all conversations'}
          />
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Selection options"
              className="text-fg-muted hover:text-fg focus-visible:outline-focus rounded-tight hidden size-5 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 sm:grid"
            >
              <ChevronDown className="size-3.5" />
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
          className="flex min-w-0 flex-1 items-center gap-0.5"
          role="toolbar"
          aria-label="Bulk actions"
        >
          {!isTrash && !isDrafts ? (
            <IconButton label="Archive" shortcut="E" onClick={onArchive}>
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
          <ToolbarDivider className="hidden sm:block" />
          <span className="hidden items-center gap-0.5 sm:flex">
            <IconButton label="Mark as read" shortcut="⇧I" onClick={onRead}>
              <MailOpen />
            </IconButton>
            <IconButton label="Mark as unread" shortcut="⇧U" onClick={onUnread}>
              <Mail />
            </IconButton>
            <IconButton label="Star" shortcut="S" onClick={onStar}>
              <Star />
            </IconButton>
            <MoveMenu folders={folders} currentFolder={folder} onMove={onMove}>
              <IconButton label="Move to">
                <FolderInput />
              </IconButton>
            </MoveMenu>
          </span>
          <span
            className="text-caption text-fg-secondary ml-auto pl-2 whitespace-nowrap"
            aria-live="polite"
          >
            {selectedCount} selected
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="text-title text-fg truncate font-semibold">{title}</h1>
          {subtitle ? (
            <span
              className="text-caption text-fg-muted hidden shrink-0 truncate sm:inline"
              aria-live="polite"
            >
              {subtitle}
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center">
            <IconButton label="Refresh" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && 'animate-spin')} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
