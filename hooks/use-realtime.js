'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FOLDERS_KEY } from '@/hooks/use-folders';
import { SESSION_KEY } from '@/hooks/use-session';
import { ACCOUNTS_KEY } from '@/hooks/use-accounts';
import { useUiStore } from '@/stores/ui-store';
import { useAccountStore } from '@/stores/account-store';
import { peekAccountQueryClient } from '@/utils/query-clients';
import { notifyNewMail } from '@/hooks/use-notifications';

const POLL_INTERVAL_MS = 60_000;

/**
 * One SSE stream per tab carrying changes for every signed-in mailbox. Each
 * event names its mailbox and only that mailbox's cache is touched, so
 * activity in one mailbox can never refresh or leak into another. If the
 * stream cannot be established (proxy buffering, corporate networks …) it
 * degrades to polling. Also refreshes on tab focus.
 *
 * Must run with the root query client (outside any mailbox scope).
 *
 * @param {{ enabled: boolean, accountsKey: string, onSwitch: (email: string, path?: string) => void }} options
 */
export function useRealtime({ enabled, accountsKey, onSwitch }) {
  const rootClient = useQueryClient();
  const setStatus = useUiStore((s) => s.setRealtimeStatus);
  const switchRef = useRef(onSwitch);
  useEffect(() => {
    switchRef.current = onSwitch;
  }, [onSwitch]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined')
      return undefined;

    let source = null;
    let pollTimer = null;
    let failures = 0;
    let disposed = false;
    let reconnectTimer = null;
    let accountsTimer = null;
    const reauthWarned = new Set();

    const refreshAccounts = () => {
      clearTimeout(accountsTimer);
      accountsTimer = setTimeout(
        () => rootClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
        400
      );
    };

    const refresh = (account, folder) => {
      const targets = account ? [account] : useAccountStore.getState().accounts.map((a) => a.email);
      for (const email of targets) {
        const client = peekAccountQueryClient(email);
        if (!client) continue;
        client.invalidateQueries({ queryKey: FOLDERS_KEY });
        client.invalidateQueries({
          queryKey: ['messages'],
          predicate: (q) =>
            !folder || q.queryKey[1]?.folder === folder || q.queryKey[1]?.role === 'starred',
        });
      }
      refreshAccounts();
    };

    const startPolling = () => {
      if (pollTimer) return;
      setStatus('polling');
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') refresh(null);
      }, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const parse = (e) => {
      try {
        return JSON.parse(e.data);
      } catch {
        return {};
      }
    };

    const onNewMail = (e) => {
      const data = parse(e);
      const account = data.account || useAccountStore.getState().active;
      refresh(account, 'INBOX');
      const messages = data.messages || [];
      const active = useAccountStore.getState().active;
      const prefs =
        peekAccountQueryClient(account)?.getQueryData(SESSION_KEY)?.preferences ||
        peekAccountQueryClient(active)?.getQueryData(SESSION_KEY)?.preferences;
      const multi = useAccountStore.getState().accounts.length > 1;
      if (prefs?.notifications?.newMail !== false && messages.length) {
        const first = messages[0];
        const who = first.from?.name || first.from?.address || 'New message';
        const path = `/mail/inbox/message/${first.uid}?folder=INBOX`;
        const other = account !== active;
        toast(messages.length > 1 ? `${messages.length} new messages` : who, {
          description: [
            multi ? account : null,
            messages.length > 1
              ? `Latest: ${first.subject || '(no subject)'}`
              : first.subject || '(no subject)',
          ]
            .filter(Boolean)
            .join(' · '),
          action: {
            label: other ? 'Switch & open' : 'Open',
            onClick: () => switchRef.current?.(account, path),
          },
        });
      }
      notifyNewMail(messages, prefs, { account, multi });
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
      source.addEventListener('new_mail', onNewMail);
      for (const type of ['mailbox_changed', 'expunge', 'flags']) {
        source.addEventListener(type, (e) => refresh(parse(e).account || null, 'INBOX'));
      }
      source.addEventListener('disconnected', () => setStatus('polling'));
      source.addEventListener('auth_failed', (e) => {
        // One mailbox's password changed: flag it in the switcher instead of
        // throwing the whole browser back to the sign-in page.
        const account = parse(e).account;
        refreshAccounts();
        if (account && !reauthWarned.has(account)) {
          reauthWarned.add(account);
          toast.error(`${account} needs to sign in again`, {
            description: 'Its password was changed or the mailbox was disabled.',
          });
        }
      });
      source.addEventListener('accounts_changed', () => {
        rootClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      });
      source.addEventListener('session_ended', () => {
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
      if (document.visibilityState === 'visible') refresh(useAccountStore.getState().active);
    };
    const onOnline = () => {
      if (!source) connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    connect();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      if (source) source.close();
      clearTimeout(reconnectTimer);
      clearTimeout(accountsTimer);
      stopPolling();
    };
  }, [enabled, accountsKey, rootClient, setStatus]);
}
