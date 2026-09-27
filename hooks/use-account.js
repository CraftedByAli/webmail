'use client';

import { createContext, useContext, useMemo } from 'react';
import { bindApi } from '@/utils/api-client';
import { useAccountStore } from '@/stores/account-store';

/**
 * The mailbox a subtree belongs to. The app shell provides the active mailbox;
 * each compose window provides its own, so a draft keeps sending from the
 * mailbox it was started in even after the user switches.
 */
export const AccountContext = createContext(null);

export function useAccount() {
  const scoped = useContext(AccountContext);
  const active = useAccountStore((s) => s.active);
  return scoped || active;
}

/** API helpers pinned to the current subtree's mailbox. */
export function useApi() {
  const account = useAccount();
  return useMemo(() => bindApi(account), [account]);
}
