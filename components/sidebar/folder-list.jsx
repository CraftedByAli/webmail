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
  Plus,
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
 * Standard folders in a fixed order, then the user's own folders as a
 * collapsible tree. Rows accept dropped messages, which is the fastest way to
 * file mail with a pointer.
 */
export function FolderList({ folders, roles, onRename, onDelete, onCreateChild, onCreate }) {
  const pathname = usePathname();
  const actions = useMailActions();
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dropTarget, setDropTarget] = useState(null);

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

  const handleDrop = (folder) => (event) => {
    event.preventDefault();
    setDropTarget(null);
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
    const count = f.role === 'drafts' ? f.total : f.unread;
    const droppable = !f.virtual && f.role !== 'drafts' && f.role !== 'sent';
    const isDropTarget = dropTarget === f.path;

    return (
      <li key={f.path} className="group relative">
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          data-testid={`folder-${f.role || f.path}`}
          className={cn(
            'text-ui rounded-control flex h-7 items-center gap-2.5 pr-1.5 transition-colors duration-100',
            active
              ? 'bg-accent-subtle text-accent-text font-medium'
              : 'text-fg-secondary hover:bg-hover hover:text-fg',
            isDropTarget && 'ring-accent ring-2 ring-inset'
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onDragOver={
            droppable
              ? (e) => {
                  e.preventDefault();
                  setDropTarget(f.path);
                }
              : undefined
          }
          onDragLeave={droppable ? () => setDropTarget(null) : undefined}
          onDrop={droppable ? handleDrop(f) : undefined}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={collapsed.has(f.path) ? `Expand ${f.name}` : `Collapse ${f.name}`}
              onClick={(e) => {
                e.preventDefault();
                toggle(f.path);
              }}
              className="text-fg-muted hover:text-fg rounded-tight -ml-1.5 grid size-4 shrink-0 place-items-center"
            >
              <ChevronRight
                className={cn(
                  'size-3 transition-transform duration-100',
                  !collapsed.has(f.path) && 'rotate-90'
                )}
              />
            </button>
          ) : null}
          <Icon
            className={cn('size-4 shrink-0', f.role === 'starred' && active && 'fill-current')}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          {count ? (
            <span
              data-numeric
              className={cn(
                'text-caption shrink-0 pl-1 group-hover:hidden',
                active ? 'text-accent-text' : 'text-fg font-medium'
              )}
            >
              {count > 999 ? '999+' : count}
            </span>
          ) : null}
        </Link>

        {!f.role && !f.virtual ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Options for ${f.name}`}
                className="text-fg-muted hover:bg-active hover:text-fg rounded-tight absolute top-1/2 right-0.5 hidden size-6 -translate-y-1/2 place-items-center transition-colors group-hover:grid data-[state=open]:grid"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onCreateChild(f)}>New subfolder</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRename(f)}>Rename</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => onDelete(f)}>
                Delete folder
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
      <ul className="grid gap-px">{system.map((f) => renderRow(f))}</ul>

      <div className="mt-4 flex h-6 items-center justify-between pr-0.5 pl-2">
        <h2 className="text-meta text-fg-muted font-semibold tracking-wide uppercase">Folders</h2>
        <button
          type="button"
          aria-label="Create folder"
          onClick={onCreate}
          className="text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-focus rounded-tight grid size-5 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {tree.length ? (
        <ul className="mt-0.5 grid gap-px">{renderTree(tree)}</ul>
      ) : (
        <p className="text-caption text-fg-muted px-2 py-1">No custom folders yet.</p>
      )}
    </>
  );
}
