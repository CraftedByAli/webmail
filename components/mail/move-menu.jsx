'use client';

import { Folder, Inbox, Archive, Trash2, ShieldAlert, Send, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLE_ICONS = {
  inbox: Inbox,
  archive: Archive,
  junk: ShieldAlert,
  trash: Trash2,
  sent: Send,
  drafts: FileText,
};

/** Folder picker for "Move to". System folders are listed first. */
export function MoveMenu({ folders = [], currentFolder, onMove, children }) {
  const targets = folders.filter(
    (f) => f.selectable && f.path !== currentFolder && f.role !== 'drafts' && f.role !== 'sent'
  );
  const system = targets.filter((f) => f.role);
  const custom = targets.filter((f) => !f.role);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {system.map((f) => {
          const Icon = ROLE_ICONS[f.role] || Folder;
          return (
            <DropdownMenuItem key={f.path} onSelect={() => onMove(f.path)}>
              <Icon />
              <span className="truncate">{f.name}</span>
            </DropdownMenuItem>
          );
        })}
        {system.length && custom.length ? <DropdownMenuSeparator /> : null}
        {custom.map((f) => (
          <DropdownMenuItem key={f.path} onSelect={() => onMove(f.path)}>
            <Folder />
            <span className="truncate">
              {f.parentPath ? `${f.parentPath}${f.delimiter}` : ''}
              {f.name}
            </span>
          </DropdownMenuItem>
        ))}
        {targets.length === 0 ? (
          <DropdownMenuItem disabled>No other folders</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
