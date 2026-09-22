'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Star,
  Send,
  FileText,
  Archive,
  ShieldAlert,
  Trash2,
  Folder,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { folderHref } from '@/utils/mail-routes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useMailActions } from '@/hooks/use-mail-actions';

const ROLE_ICONS = {
  inbox: Inbox,
  starred: Star,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  junk: ShieldAlert,
  trash: Trash2,
};
const ROLE_ORDER = ['inbox', 'starred', 'sent', 'drafts', 'archive', 'junk', 'trash'];

/**
 * Renders the standard folders (in a fixed order) followed by a collapsible
 * tree of custom folders. Rows accept drag-and-drop of message rows.
 */
export function FolderList({ folders, roles, onRename, onDelete, onCreateChild }) {
  const pathname = usePathname();
  const actions = useMailActions();
  const [collapsed, setCollapsed] = useState(() => new Set());

  const { system, tree } = useMemo(() => {
    const byRole = new Map();
    for (const f of folders) if (f.role) byRole.set(f.role, f);
    const system = ROLE_ORDER.map((role) => {
      if (role === 'starred')
        return { path: '__starred', name: 'Starred', role: 'starred', virtual: true };
      return (
        byRole.get(role) ||
        (role === 'inbox' ? { path: 'INBOX', name: 'Inbox', role: 'inbox' } : null)
      );
    }).filter(Boolean);

    const custom = folders.filter((f) => !f.role);
    const children = new Map();
    const roots = [];
    for (const f of custom) {
      const parent =
        f.parentPath && custom.some((c) => c.path === f.parentPath) ? f.parentPath : null;
      if (parent) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(f);
      } else roots.push(f);
    }
    const build = (list, depth) =>
      list.map((f) => ({
        folder: f,
        depth,
        children: build(children.get(f.path) || [], depth + 1),
      }));
    return { system, tree: build(roots, 0) };
  }, [folders]);

  const toggle = (path) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const isActive = (f) => {
    const href = f.virtual ? '/mail/starred' : folderHref(f);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const onDrop = (folder) => (event) => {
    event.preventDefault();
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData('application/x-webmail-messages'));
    } catch {
      return;
    }
    if (!payload?.folder || !payload?.uids?.length || payload.folder === folder.path) return;
    if (folder.role === 'trash') actions.trash(payload.folder, payload.uids);
    else if (folder.role === 'junk') actions.spam(payload.folder, payload.uids);
    else if (folder.role === 'archive') actions.archive(payload.folder, payload.uids);
    else actions.move(payload.folder, payload.uids, folder.path);
  };

  const renderRow = (f, depth = 0, hasChildren = false) => {
    const Icon = ROLE_ICONS[f.role] || Folder;
    const active = isActive(f);
    const href = f.virtual ? '/mail/starred' : folderHref(f);
    const unread = f.role === 'drafts' ? f.total : f.unread;
    const droppable = !f.virtual && f.role !== 'drafts' && f.role !== 'sent';
    return (
      <li key={f.path} className="group relative">
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          data-testid={`folder-${f.role || f.path}`}
          className={cn(
            'hover:bg-muted flex h-9 items-center gap-3 rounded-full pr-2 text-sm transition-colors',
            active ? 'bg-accent text-accent-foreground font-semibold' : 'text-foreground/90',
            unread ? 'font-semibold' : ''
          )}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          onDragOver={
            droppable
              ? (e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('ring-2', 'ring-ring');
                }
              : undefined
          }
          onDragLeave={
            droppable ? (e) => e.currentTarget.classList.remove('ring-2', 'ring-ring') : undefined
          }
          onDrop={
            droppable
              ? (e) => {
                  e.currentTarget.classList.remove('ring-2', 'ring-ring');
                  onDrop(f)(e);
                }
              : undefined
          }
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={collapsed.has(f.path) ? 'Expand' : 'Collapse'}
              onClick={(e) => {
                e.preventDefault();
                toggle(f.path);
              }}
              className="text-muted-foreground hover:text-foreground -ml-1 rounded p-0.5"
            >
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  !collapsed.has(f.path) && 'rotate-90'
                )}
              />
            </button>
          ) : null}
          <Icon
            className={cn('h-4 w-4 shrink-0', f.role === 'starred' && active && 'fill-current')}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          {unread ? (
            <span className="ml-auto text-xs tabular-nums">{unread > 999 ? '999+' : unread}</span>
          ) : null}
        </Link>
        {!f.role && !f.virtual ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Options for ${f.name}`}
                className="text-muted-foreground hover:bg-surface hover:text-foreground absolute top-1/2 right-1 hidden -translate-y-1/2 rounded-full p-1 group-hover:block data-[state=open]:block"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onCreateChild(f)}>New subfolder</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRename(f)}>Rename</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(f)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </li>
    );
  };

  const renderTree = (nodes) =>
    nodes.flatMap((node) => [
      renderRow(node.folder, node.depth, node.children.length > 0),
      ...(!collapsed.has(node.folder.path) ? renderTree(node.children) : []),
    ]);

  return (
    <>
      <ul className="space-y-0.5">{system.map((f) => renderRow(f))}</ul>
      {tree.length ? (
        <ul className="border-border mt-2 space-y-0.5 border-t pt-2">{renderTree(tree)}</ul>
      ) : null}
    </>
  );
}
