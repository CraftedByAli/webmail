'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSection, SettingRow } from '@/components/settings/settings-primitives';
import { useUpdatePreferences } from '@/hooks/use-session';

const TIMEZONES = [
  'auto',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Istanbul',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
];

export function GeneralSettings({ session }) {
  const prefs = session.preferences.general;
  const update = useUpdatePreferences();
  const set = (patch) => update.mutate({ general: patch });

  return (
    <>
      <SettingsSection
        title="General"
        description="How you appear to recipients, and how dates are shown to you."
      >
        <SettingRow
          label="Display name"
          description="Recipients see this next to your address."
          htmlFor="displayName"
        >
          <Input
            id="displayName"
            defaultValue={prefs.displayName}
            maxLength={120}
            onBlur={(e) =>
              e.target.value !== prefs.displayName && set({ displayName: e.target.value })
            }
          />
        </SettingRow>
        <SettingRow label="Mailbox" description="The account these settings belong to.">
          <p className="text-ui text-fg-secondary truncate">{session.user.email}</p>
        </SettingRow>
        <SettingRow label="Language" htmlFor="language">
          <Select value={prefs.language} onValueChange={(v) => set({ language: v })}>
            <SelectTrigger id="language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Time zone" htmlFor="timezone">
          <Select value={prefs.timezone} onValueChange={(v) => set({ timezone: v })}>
            <SelectTrigger id="timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz === 'auto' ? 'Automatic (browser)' : tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Date format" htmlFor="dateFormat">
          <Select value={prefs.dateFormat} onValueChange={(v) => set({ dateFormat: v })}>
            <SelectTrigger id="dateFormat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              <SelectItem value="dmy">Day Month Year</SelectItem>
              <SelectItem value="mdy">Month Day, Year</SelectItem>
              <SelectItem value="ymd">Year-Month-Day</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Default reply behaviour" htmlFor="replyBehavior">
          <Select value={prefs.replyBehavior} onValueChange={(v) => set({ replyBehavior: v })}>
            <SelectTrigger id="replyBehavior">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reply">Reply</SelectItem>
              <SelectItem value="replyAll">Reply all</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsSection>
    </>
  );
}
