import { createContext, useContext } from 'react';
import { createStore, useStore } from 'zustand';
import { setActiveAccountForRequests } from '@/utils/api-client';

/**
 * Mailboxes signed in to this browser and the one this tab is showing.
 *
 * The active mailbox is per tab (sessionStorage), so two tabs can show two
 * mailboxes side by side. New tabs start on the last mailbox used anywhere in
 * the browser (localStorage + a cookie the server reads for the first render).
 */

const TAB_KEY = 'osmic.activeMailbox';
const LAST_KEY = 'osmic.lastMailbox';
const COOKIE = 'wm_account';

function safeGet(storage, key) {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    window[storage].setItem(key, value);
  } catch {
    // private mode / blocked storage: the in-memory state still works
  }
}

function writeHintCookie(email) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(email)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {
    // ignore
  }
}

/** Records the mailbox this tab shows (per tab, last-used, and the server hint cookie). */
export function rememberActive(email) {
  if (typeof window === 'undefined' || !email) return;
  safeSet('sessionStorage', TAB_KEY, email);
  safeSet('localStorage', LAST_KEY, email);
  writeHintCookie(email);
}

/** Preferred mailbox for this tab: ?account= → this tab → last used → server default. */
export function pickInitialAccount(accounts, serverDefault) {
  const emails = accounts.map((a) => a.email);
  if (typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('account');
    for (const candidate of [
      fromUrl,
      safeGet('sessionStorage', TAB_KEY),
      safeGet('localStorage', LAST_KEY),
    ]) {
      const e = candidate?.toLowerCase();
      if (e && emails.includes(e)) return e;
    }
  }
  return emails.includes(serverDefault) ? serverDefault : emails[0] || null;
}

function accountStoreState(initial) {
  return (set, get) => ({
    /** @type {Array<{ email: string, isAdmin?: boolean, primary?: boolean, status?: object }>} */
    accounts: initial?.accounts || [],
    active: initial?.active || null,
    max: initial?.max ?? 10,

    setAccounts: (accounts, max) => {
      const { active } = get();
      set({ accounts, ...(max ? { max } : {}) });
      if (active && !accounts.some((a) => a.email === active) && accounts.length) {
        get().setActive(accounts[0].email);
      }
    },

    setActive: (email) => {
      const next = String(email || '').toLowerCase();
      if (!next || next === get().active) return false;
      if (!get().accounts.some((a) => a.email === next)) return false;
      // Requests must switch before anything re-renders under the new mailbox.
      setActiveAccountForRequests(next);
      rememberActive(next);
      set({ active: next });
      return true;
    },
  });
}

/**
 * Creates a mailbox store. The server renders every request with its own
 * store (a module-level store would be shared between users' concurrent
 * renders); in the browser the single instance is also registered globally
 * so non-React code (API client, compose store) can read the active mailbox.
 */
export function createAccountStore(initial) {
  return createStore(accountStoreState(initial));
}

export const AccountStoreContext = createContext(null);

// Empty store used outside a provider (e.g. the login page) and on the server.
const fallbackStore = createAccountStore();
let clientStore = null;

/** Makes a store the browser-wide instance. Never call during server rendering. */
export function registerClientAccountStore(store) {
  if (typeof window === 'undefined' || clientStore === store) return;
  clientStore = store;
  setActiveAccountForRequests(store.getState().active);
}

function currentStore() {
  return clientStore || fallbackStore;
}

/**
 * Hook with the familiar zustand shape: `useAccountStore(selector)` inside
 * components, `useAccountStore.getState()` elsewhere (browser only).
 */
export function useAccountStore(selector = (s) => s) {
  const scoped = useContext(AccountStoreContext);
  return useStore(scoped || currentStore(), selector);
}
useAccountStore.getState = () => currentStore().getState();

export const getActiveAccount = () => currentStore().getState().active;
