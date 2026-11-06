'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { SHORTCUT_GROUPS } from '@/hooks/use-keyboard-shortcuts';

export function ShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts work whenever you are not typing. Turn them off in Settings → Keyboard
            shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-5 overflow-y-auto sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-meta text-fg-muted mb-1.5 font-semibold tracking-wide uppercase">
                {group.title}
              </h3>
              <ul className="grid gap-0.5">
                {group.items.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-ui text-fg-secondary">{s.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 ? (
                            <span className="text-meta text-fg-muted">
                              {s.sequence ? 'then' : 'or'}
                            </span>
                          ) : null}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
