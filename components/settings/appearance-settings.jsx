'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
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

export function AppearanceSettings({ session }) {
  const prefs = session.preferences.appearance;
  const update = useUpdatePreferences();
  const { setTheme } = useTheme();

  const themes = [
    ['light', 'Light', Sun],
    ['dark', 'Dark', Moon],
    ['system', 'System', Monitor],
  ];

  return (
    <SettingsSection title="Appearance" description="Theme and density.">
      <div className="px-4 py-3">
        <p className="mb-2 text-sm font-medium">Theme</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {themes.map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={prefs.theme === value}
              onClick={() => {
                setTheme(value);
                update.mutate({ appearance: { theme: value } });
              }}
              className={cn(
                'hover:bg-muted flex flex-col items-center gap-2 rounded-xl border p-3 text-sm transition-colors',
                prefs.theme === value
                  ? 'border-primary bg-accent text-accent-foreground'
                  : 'border-border'
              )}
            >
              <Icon className="h-5 w-5" /> {label}
            </button>
          ))}
        </div>
      </div>
      <SettingRow label="Density" description="Row height in the message list." htmlFor="density">
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
