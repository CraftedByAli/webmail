'use client';

import { SettingsSection, ToggleRow } from '@/components/settings/settings-primitives';
import { useUpdatePreferences } from '@/hooks/use-session';
import { SHORTCUT_LIST } from '@/hooks/use-keyboard-shortcuts';
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
          description="Gmail-style single-key shortcuts while not typing."
          checked={prefs.enabled}
          onChange={(v) => update.mutate({ shortcuts: { enabled: v } })}
        />
      </SettingsSection>
      <SettingsSection title="Reference">
        <ul className="grid grid-cols-1 gap-x-6 px-4 py-2 text-sm sm:grid-cols-2">
          {SHORTCUT_LIST.map((s) => (
            <li key={s.label} className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </>
  );
}
