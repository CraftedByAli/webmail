import { QueryClient } from '@tanstack/react-query';

/**
 * One TanStack Query cache per mailbox. Query keys (['messages', …],
 * ['folders'] …) are identical for every mailbox, so separate caches are what
 * guarantees one mailbox's mail can never be served from another's cache.
 * Switching back to a mailbox is instant because its cache is kept.
 */

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (failureCount, error) => {
          if (error?.status && error.status < 500 && error.status !== 0) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: true,
      },
      mutations: { retry: 0 },
    },
  });
}

const clients = new Map();

/** @param {string} email */
export function getAccountQueryClient(email) {
  const key = String(email || '').toLowerCase();
  let client = clients.get(key);
  if (!client) {
    client = createQueryClient();
    clients.set(key, client);
  }
  return client;
}

/** Existing cache for a mailbox, without creating one. */
export function peekAccountQueryClient(email) {
  return clients.get(String(email || '').toLowerCase()) || null;
}

/** Forgets a mailbox's cache (after signing it out). */
export function dropAccountQueryClient(email) {
  const key = String(email || '').toLowerCase();
  const client = clients.get(key);
  if (client) {
    client.cancelQueries();
    client.clear();
    clients.delete(key);
  }
}

export function dropAllAccountQueryClients() {
  for (const key of [...clients.keys()]) dropAccountQueryClient(key);
}
