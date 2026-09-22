'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsSection, ToggleRow } from '@/components/settings/settings-primitives';
import { useUpdatePreferences } from '@/hooks/use-session';
import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
} from '@/hooks/use-notifications';

export function NotificationSettings({ session }) {
  const prefs = session.preferences.notifications;
  const update = useUpdatePreferences();
  const [permission, setPermission] = useState(notificationPermission());
  const set = (patch) => update.mutate({ notifications: patch });

  async function toggleDesktop(enabled) {
    if (enabled) {
      if (!notificationsSupported()) {
        toast.error('This browser does not support desktop notifications.');
        return;
      }
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== 'granted') {
        toast.error('Notification permission was not granted.');
        return;
      }
    }
    set({ desktop: enabled });
  }

  return (
    <SettingsSection title="Notifications" description="How you are told about new mail.">
      <ToggleRow
        id="newMail"
        label="In-app alerts"
        description="Show a toast when new mail arrives."
        checked={prefs.newMail}
        onChange={(v) => set({ newMail: v })}
      />
      <ToggleRow
        id="desktop"
        label="Desktop notifications"
        description={
          permission === 'denied'
            ? 'Blocked by the browser. Allow notifications for this site to enable.'
            : 'Uses the browser notification system when the tab is in the background.'
        }
        checked={prefs.desktop && permission === 'granted'}
        onChange={toggleDesktop}
      />
      <ToggleRow
        id="sound"
        label="Sound"
        description="Play a short chime with desktop notifications."
        checked={prefs.sound}
        onChange={(v) => set({ sound: v })}
      />
    </SettingsSection>
  );
}
