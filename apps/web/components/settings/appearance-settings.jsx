'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { SettingsSection, SettingRow } from '@/components/settings/settings-primitives';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdatePreferences } from '@/hooks/use-session';
import { cn } from '@/utils/cn';

const THEMES = [
  ['light', 'Light', Sun],
  ['dark', 'Dark', Moon],
  ['system', 'System', Monitor],
];

export function AppearanceSettings({ session }) {
  const prefs = session.preferences.appearance;
  const update = useUpdatePreferences();
  const { setTheme } = useTheme();

  return (
    <SettingsSection
      title="Appearance"
      description="How this mailbox looks on this and every signed-in device."
    >
      <fieldset>
        <legend className="text-ui text-fg font-medium">Theme</legend>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map(([value, label, Icon]) => {
            const active = prefs.theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTheme(value);
                  update.mutate({ appearance: { theme: value } });
                }}
                className={cn(
                  'text-ui rounded-control relative flex flex-col items-start gap-2 border p-3 transition-colors duration-100',
                  active
                    ? 'border-accent bg-accent-subtle text-accent-text'
                    : 'border-line-strong text-fg-secondary hover:bg-hover hover:text-fg'
                )}
              >
                <Icon className="size-4" />
                {label}
                {active ? (
                  <Check className="absolute top-2 right-2 size-3.5" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <SettingRow
        label="Density"
        description="Compact fits roughly a third more messages on screen."
        htmlFor="density"
      >
        <Select
          value={prefs.density}
          onValueChange={(v) => update.mutate({ appearance: { density: v } })}
        >
          <SelectTrigger id="density">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comfortable">Comfortable</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingsSection>
  );
}
