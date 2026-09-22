'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { SHORTCUT_LIST } from '@/hooks/use-keyboard-shortcuts';

export function ShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts can be turned off in Settings → Keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-[60vh] grid-cols-1 gap-x-8 gap-y-1.5 overflow-y-auto text-sm sm:grid-cols-2">
          {SHORTCUT_LIST.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 py-0.5">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 ? (
                      <span className="text-muted-foreground text-xs">
                        {s.keys[0] === 'g' || s.keys[0] === 'Shift' ? 'then' : '/'}
                      </span>
                    ) : null}
                    <Kbd>{k}</Kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
