/**
 * Folder role detection. Mailcow/Dovecot advertises SPECIAL-USE flags for the
 * standard folders, and imapflow additionally matches localized names. We map
 * both to a stable role identifier used by the UI.
 */

export const FOLDER_ROLES = /** @type {const} */ ({
  inbox: 'inbox',
  starred: 'starred',
  sent: 'sent',
  drafts: 'drafts',
  archive: 'archive',
  junk: 'junk',
  trash: 'trash',
  all: 'all',
});

const SPECIAL_USE_TO_ROLE = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Archive': 'archive',
  '\\Junk': 'junk',
  '\\Trash': 'trash',
  '\\All': 'all',
  '\\Flagged': 'starred',
};

const NAME_TO_ROLE = [
  [/^inbox$/i, 'inbox'],
  [/^(sent|sent items|sent mail|sent messages)$/i, 'sent'],
  [/^(drafts?)$/i, 'drafts'],
  [/^(archive|archives|all mail)$/i, 'archive'],
  [/^(junk|junk e-?mail|spam|bulk mail)$/i, 'junk'],
  [/^(trash|deleted|deleted items|deleted messages|bin)$/i, 'trash'],
];

export const ROLE_ORDER = ['inbox', 'starred', 'sent', 'drafts', 'archive', 'junk', 'trash'];

/**
 * @param {{ path: string, name: string, specialUse?: string, parent?: string[] }} entry
 * @returns {string | null}
 */
export function detectRole(entry) {
  if (entry.path.toUpperCase() === 'INBOX') return 'inbox';
  if (entry.specialUse && SPECIAL_USE_TO_ROLE[entry.specialUse])
    return SPECIAL_USE_TO_ROLE[entry.specialUse];
  // Only top-level folders (or direct INBOX children, as some Dovecot layouts use) qualify by name.
  const isTopLevel =
    !entry.parent ||
    entry.parent.length === 0 ||
    (entry.parent.length === 1 && entry.parent[0].toUpperCase() === 'INBOX');
  if (isTopLevel) {
    for (const [re, role] of NAME_TO_ROLE) {
      if (re.test(entry.name)) return role;
    }
  }
  return null;
}

/**
 * Normalises imapflow list entries into the folder model used by the UI.
 * Exactly one folder is assigned per role (the first match wins, preferring
 * server-advertised special-use flags).
 *
 * @param {import('imapflow').ListResponse[]} entries
 */
export function buildFolderModel(entries) {
  const assigned = new Map();
  const folders = [];

  const sorted = [...entries].sort((a, b) => {
    // Prefer folders whose role came from the server extension.
    const sa = a.specialUseSource === 'extension' ? 0 : 1;
    const sb = b.specialUseSource === 'extension' ? 0 : 1;
    return sa - sb;
  });

  for (const entry of sorted) {
    if (entry.flags?.has('\\NonExistent')) continue;
    let role = detectRole(entry);
    if (role && assigned.has(role)) role = null;
    if (role) assigned.set(role, entry.path);
    folders.push({
      id: entry.path,
      path: entry.path,
      name: entry.path.toUpperCase() === 'INBOX' ? 'Inbox' : entry.name,
      delimiter: entry.delimiter,
      parentPath: entry.parentPath || '',
      role,
      selectable: !entry.flags?.has('\\Noselect'),
      subscribed: entry.subscribed !== false,
      total: entry.status?.messages ?? null,
      unread: entry.status?.unseen ?? null,
    });
  }

  folders.sort((a, b) => {
    const ra = a.role ? ROLE_ORDER.indexOf(a.role) : 99;
    const rb = b.role ? ROLE_ORDER.indexOf(b.role) : 99;
    if (ra !== rb) return ra - rb;
    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
  });

  return { folders, roles: Object.fromEntries(assigned) };
}

/** Standard folder names to create when a role folder is missing. */
export const DEFAULT_ROLE_NAMES = {
  sent: 'Sent',
  drafts: 'Drafts',
  archive: 'Archive',
  junk: 'Junk',
  trash: 'Trash',
};
