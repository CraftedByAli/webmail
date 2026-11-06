'use client';

import { SettingsSection, ToggleRow } from '@/components/settings/settings-primitives';
import { useUpdatePreferences } from '@/hooks/use-session';
import { SHORTCUT_GROUPS } from '@/hooks/use-keyboard-shortcuts';
import { Kbd } from '@/components/ui/kbd';

export function ShortcutSettings({ session }) {
  const prefs = session.preferences.shortcuts;
  const update = useUpdatePreferences();

  return (
    <>
      <SettingsSection title="Keyboard shortcuts">
        <ToggleRow
          id="shortcutsEnabled"
          label="Enable keyboard shortcuts"
          description="Single-key shortcuts act on the focused conversation whenever you are not typing."
          checked={prefs.enabled}
          onChange={(v) => update.mutate({ shortcuts: { enabled: v } })}
        />
      </SettingsSection>

      <SettingsSection title="Reference">
        <div className="grid gap-5 sm:grid-cols-2">
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
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SettingsSection>
    </>
  );
}
