'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/utils/api-client';
import { useAccountStore } from '@/stores/account-store';
import { useComposeStore } from '@/stores/compose-store';
import { useUiStore } from '@/stores/ui-store';
import { dropAccountQueryClient, dropAllAccountQueryClients } from '@/utils/query-clients';
import { ROLE_VIEWS } from '@/utils/mail-routes';

export const ACCOUNTS_KEY = ['accounts'];

/**
 * Where to land after switching mailbox. Message UIDs and custom folders
 * belong to the mailbox they came from, so conversations and folder views
 * fall back to the same role view (or the Inbox) of the new mailbox.
 */
export function pathAfterSwitch(pathname, search = '', { isAdmin = false } = {}) {
  if (!pathname) return '/mail/inbox';
  if (pathname.startsWith('/admin')) return isAdmin ? pathname : '/mail/inbox';
  if (pathname.startsWith('/settings') || pathname.startsWith('/contacts'))
    return pathname + search;
  if (pathname.startsWith('/mail/')) {
    const view = pathname.split('/')[2] || 'inbox';
    if (ROLE_VIEWS[view]) return `/mail/${view}`;
    if (view === 'search') {
      const q = new URLSearchParams(search).get('q');
      return q ? `/mail/search?q=${encodeURIComponent(q)}` : '/mail/inbox';
    }
  }
  return '/mail/inbox';
}

/** Mailbox management actions shared by the switcher, settings and dialogs. */
export function useAccountActions() {
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    const res = await api('/api/auth/accounts', { method: 'GET', account: null });
    useAccountStore.getState().setAccounts(res.accounts, res.max);
    return res;
  }, []);

  const switchTo = useCallback(
    (email, { path } = {}) => {
      const store = useAccountStore.getState();
      const target = store.accounts.find((a) => a.email === email);
      if (!target) return false;
      if (email === store.active) {
        if (path) router.push(path);
        return true;
      }
      useUiStore.getState().clearSelection();
      useUiStore.getState().setFocusedIndex(-1);
      store.setActive(email);
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.replace(path || pathAfterSwitch(pathname, search, { isAdmin: target.isAdmin }));
      return true;
    },
    [router, pathname]
  );

  const addMailbox = useCallback(
    async ({ email, password }) => {
      const res = await api('/api/auth/accounts', {
        method: 'POST',
        json: { email, password },
        account: null,
      });
      useAccountStore.getState().setAccounts(res.accounts, res.max);
      switchTo(res.account.email);
      toast.success(
        res.added ? `Signed in to ${res.account.email}` : `${res.account.email} reconnected`
      );
      refresh().catch(() => {});
      return res;
    },
    [switchTo, refresh]
  );

  const forgetLocally = useCallback(
    (email, next) => {
      const store = useAccountStore.getState();
      const wasActive = store.active === email;
      useComposeStore.getState().closeForAccount(email);
      const remaining = store.accounts.filter((a) => a.email !== email);
      if (remaining.length === 0) {
        dropAllAccountQueryClients();
        window.location.assign('/login');
        return;
      }
      if (wasActive)
        switchTo(next && remaining.some((a) => a.email === next) ? next : remaining[0].email);
      useAccountStore.getState().setAccounts(remaining);
      // Drop the cache once its scope has unmounted, so nothing refetches it.
      setTimeout(() => dropAccountQueryClient(email), 1000);
    },
    [switchTo]
  );

  const signOutMailbox = useCallback(
    async (email) => {
      const res = await api('/api/auth/accounts', {
        method: 'DELETE',
        json: { email },
        account: null,
      });
      if (res.signedOut) {
        dropAllAccountQueryClients();
        window.location.assign('/login');
        return res;
      }
      forgetLocally(email, res.next);
      toast.success(`Signed out of ${email}`);
      return res;
    },
    [forgetLocally]
  );

  const signOutAll = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', account: null });
    } catch {
      // The cookie is cleared regardless; always land on the login screen.
    }
    dropAllAccountQueryClients();
    router.replace('/login');
    router.refresh();
  }, [router]);

  return { refresh, switchTo, addMailbox, signOutMailbox, signOutAll, forgetLocally };
}
