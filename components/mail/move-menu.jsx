'use client';

import { Folder, Inbox } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Folder picker used by "Move to". */
export function MoveMenu({ folders = [], currentFolder, onMove, children }) {
  const targets = folders.filter(
    (f) => f.selectable && f.path !== currentFolder && f.role !== 'drafts' && f.role !== 'sent'
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {targets.map((f) => (
          <DropdownMenuItem key={f.path} onSelect={() => onMove(f.path)}>
            {f.role === 'inbox' ? <Inbox /> : <Folder />}
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
