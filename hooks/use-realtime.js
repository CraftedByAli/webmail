'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FOLDERS_KEY } from '@/hooks/use-folders';
import { useUiStore } from '@/stores/ui-store';
import { notifyNewMail } from '@/hooks/use-notifications';

const POLL_INTERVAL_MS = 60_000;

/**
 * Subscribes to the SSE stream for mailbox changes. If the stream cannot be
 * established (proxy buffering, corporate networks, etc.) it degrades to
 * periodic polling. Also refreshes on tab focus.
 *
 * @param {{ enabled: boolean, preferences?: object, currentFolder?: string }} options
 */
export function useRealtime({ enabled, preferences, currentFolder }) {
  const queryClient = useQueryClient();
  const setStatus = useUiStore((s) => s.setRealtimeStatus);
  const prefsRef = useRef(preferences);
  const folderRef = useRef(currentFolder);
  useEffect(() => {
    prefsRef.current = preferences;
    folderRef.current = currentFolder;
  }, [preferences, currentFolder]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined')
      return undefined;

    let source = null;
    let pollTimer = null;
    let failures = 0;
    let disposed = false;
    let reconnectTimer = null;

    const refresh = (folder) => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      queryClient.invalidateQueries({
        queryKey: ['messages'],
        predicate: (q) =>
          !folder || q.queryKey[1]?.folder === folder || q.queryKey[1]?.role === 'starred',
      });
    };

    const startPolling = () => {
      if (pollTimer) return;
      setStatus('polling');
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') refresh();
      }, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const connect = () => {
      if (disposed) return;
      try {
        source = new EventSource('/api/realtime', { withCredentials: true });
      } catch {
        startPolling();
        return;
      }

      source.addEventListener('ready', () => {
        failures = 0;
        stopPolling();
        setStatus('live');
      });
      source.addEventListener('connected', () => setStatus('live'));
      source.addEventListener('new_mail', (e) => {
        let data = {};
        try {
          data = JSON.parse(e.data);
        } catch {
          // ignore
        }
        refresh('INBOX');
        const messages = data.messages || [];
        const prefs = prefsRef.current;
        if (prefs?.notifications?.newMail !== false && messages.length) {
          const first = messages[0];
          const who = first.from?.name || first.from?.address || 'New message';
          toast(messages.length > 1 ? `${messages.length} new messages` : who, {
            description:
              messages.length > 1
                ? `Latest: ${first.subject || '(no subject)'}`
                : first.subject || '(no subject)',
            action: {
              label: 'Open',
              onClick: () =>
                window.location.assign(`/mail/inbox/message/${first.uid}?folder=INBOX`),
            },
          });
        }
        notifyNewMail(messages, prefs);
      });
      source.addEventListener('mailbox_changed', () => refresh('INBOX'));
      source.addEventListener('expunge', () => refresh('INBOX'));
      source.addEventListener('flags', () => refresh('INBOX'));
      source.addEventListener('disconnected', () => setStatus('polling'));
      source.addEventListener('auth_failed', () => {
        window.location.assign('/login?reason=expired');
      });
      source.onerror = () => {
        failures += 1;
        if (source.readyState === EventSource.CLOSED) {
          source = null;
          startPolling();
          const delay = Math.min(60_000, 2000 * 2 ** Math.min(failures, 5));
          reconnectTimer = setTimeout(connect, delay);
        } else if (failures > 2) {
          startPolling();
        }
      };
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh(folderRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', () => connect());

    connect();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (source) source.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
    };
  }, [enabled, queryClient, setStatus]);
}
