'use client';

import { SettingsSection, SettingRow, ToggleRow } from '@/components/settings/settings-primitives';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdatePreferences } from '@/hooks/use-session';
import { useFolders } from '@/hooks/use-folders';

export function InboxSettings({ session }) {
  const prefs = session.preferences.inbox;
  const update = useUpdatePreferences();
  const { data: folders } = useFolders();
  const set = (patch) => update.mutate({ inbox: patch });

  return (
    <SettingsSection title="Reading" description="How messages are listed and displayed.">
      <SettingRow
        label="Page size"
        description="How many conversations load at a time."
        htmlFor="pageSize"
      >
        <Select value={String(prefs.pageSize)} onValueChange={(v) => set({ pageSize: Number(v) })}>
          <SelectTrigger id="pageSize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <ToggleRow
        id="conversationView"
        label="Conversation view"
        description="Group replies with the message they answer."
        checked={prefs.conversationView}
        onChange={(v) => set({ conversationView: v })}
      />
      <ToggleRow
        id="previewText"
        label="Preview text"
        description="Show the first line of each message in the list."
        checked={prefs.previewText}
        onChange={(v) => set({ previewText: v })}
      />
      <ToggleRow
        id="autoLoadImages"
        label="Always load remote images"
        description="Remote images can report when and where you opened a message, so they are blocked until you ask for them."
        checked={prefs.autoLoadImages}
        onChange={(v) => set({ autoLoadImages: v })}
      />
      <SettingRow
        label="Default folder"
        description="Opened when you sign in."
        htmlFor="defaultFolder"
      >
        <Select value={prefs.defaultFolder} onValueChange={(v) => set({ defaultFolder: v })}>
          <SelectTrigger id="defaultFolder">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(folders?.folders || [{ path: 'INBOX', name: 'Inbox' }])
              .filter((f) => f.selectable !== false)
              .map((f) => (
                <SelectItem key={f.path} value={f.path}>
                  {f.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingsSection>
  );
}
