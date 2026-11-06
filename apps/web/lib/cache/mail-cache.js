import { MemoryCache } from '@/lib/cache/memory-cache';

/**
 * Process-wide cache for cheap-to-invalidate mail metadata: folder lists,
 * unread counts, thread maps and search results. Message bodies are never
 * cached here.
 */
const globalKey = Symbol.for('webmail.mailCache');
if (!globalThis[globalKey]) globalThis[globalKey] = new MemoryCache({ maxEntries: 2000 });

/** @type {MemoryCache} */
export const mailCache = globalThis[globalKey];

export const TTL = {
  folders: 20_000,
  threads: 45_000,
  search: 30_000,
};

export function folderKey(email) {
  return `folders:${email.toLowerCase()}`;
}

export function mailboxKey(email, folder, suffix) {
  return `mailbox:${email.toLowerCase()}:${folder}:${suffix}`;
}

/** Drops everything cached for a folder (and the folder list, for counts). */
export function invalidateMailboxCache(email, folder) {
  const e = email.toLowerCase();
  mailCache.delete(folderKey(e));
  if (folder) mailCache.deletePrefix(`mailbox:${e}:${folder}:`);
  else mailCache.deletePrefix(`mailbox:${e}:`);
}

export function invalidateUserCache(email) {
  invalidateMailboxCache(email);
}
