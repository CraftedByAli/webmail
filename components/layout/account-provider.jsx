'use client';

import { useEffect, useState } from 'react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, onAccountSignedOut } from '@/utils/api-client';
import { getAccountQueryClient } from '@/utils/query-clients';
import {
  AccountStoreContext,
  createAccountStore,
  pickInitialAccount,
  registerClientAccountStore,
  rememberActive,
  useAccountStore,
} from '@/stores/account-store';
import { AccountContext } from '@/hooks/use-account';
import { ACCOUNTS_KEY, useAccountActions } from '@/hooks/use-accounts';
import { useRealtime } from '@/hooks/use-realtime';

/**
 * Owns the list of signed-in mailboxes and which one this tab shows. Runs on
 * the root query client, above every mailbox scope, so it keeps working (and
 * realtime keeps flowing for all mailboxes) while the user switches.
 */
export function AccountProvider(props) {
  // One store per provider: the first render already has a mailbox, and it
  // matches the server render, which used the same last-used hint cookie.
  const [store] = useState(() =>
    createAccountStore({
      accounts: props.accounts,
      active: props.initialActive,
      max: props.maxAccounts,
    })
  );
  // Idempotent and browser-only; must happen before children render so API
  // calls made during their first effects already carry the mailbox.
  registerClientAccountStore(store);
  return (
    <AccountStoreContext.Provider value={store}>
      <AccountProviderInner {...props} />
    </AccountStoreContext.Provider>
  );
}

function AccountProviderInner({ accounts: initialAccounts, initialActive, children }) {
  const accounts = useAccountStore((s) => s.accounts);
  const { switchTo, forgetLocally } = useAccountActions();

  // Per-tab preference (sessionStorage / ?account=) can only be read in the
  // browser, so apply it after hydration.
  useEffect(() => {
    const preferred = pickInitialAccount(initialAccounts, initialActive);
    if (preferred && preferred !== useAccountStore.getState().active) switchTo(preferred);
    else rememberActive(preferred);
    const url = new URL(window.location.href);
    if (url.searchParams.has('account')) {
      url.searchParams.delete('account');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => api('/api/auth/accounts', { method: 'GET', account: null }),
    refetchInterval: 60_000,
    staleTime: 10_000,
  });
  useEffect(() => {
    if (list.data?.accounts) {
      useAccountStore.getState().setAccounts(list.data.accounts, list.data.max);
    }
  }, [list.data]);

  useEffect(() => {
    onAccountSignedOut((email) => {
      if (!email) return;
      const known = useAccountStore.getState().accounts.some((a) => a.email === email);
      if (!known) return;
      toast.error(`${email} was signed out on this device`);
      forgetLocally(email);
    });
    return () => onAccountSignedOut(null);
  }, [forgetLocally]);

  useRealtime({
    enabled: accounts.length > 0,
    // A mailbox that needed a new password reconnects its realtime stream once fixed.
    accountsKey: accounts
      .map((a) => `${a.email}${a.status?.state === 'reauth' ? '!' : ''}`)
      .join(','),
    onSwitch: (email, path) => switchTo(email, { path }),
  });

  return children;
}

/**
 * Everything below renders for exactly one mailbox: its own query cache and
 * an AccountContext that pins API calls to it. Keyed by mailbox so switching
 * remounts the tree and no component state carries over.
 */
export function AccountScope({ account, children }) {
  return (
    <QueryClientProvider client={getAccountQueryClient(account)}>
      <AccountContext.Provider value={account}>{children}</AccountContext.Provider>
    </QueryClientProvider>
  );
}
