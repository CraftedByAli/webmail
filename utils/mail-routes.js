/**
 * URL scheme for the mail area:
 *   /mail/inbox | starred | sent | drafts | archive | spam | trash
 *   /mail/folder/<encoded path>
 *   /mail/search?q=...
 *   …/thread/<uid>-<uid>       conversation inside the current view
 *   …/message/<uid>            single message (non-conversation view)
 */

export const ROLE_VIEWS = {
  inbox: { label: 'Inbox', role: 'inbox' },
  starred: { label: 'Starred', role: 'starred' },
  sent: { label: 'Sent', role: 'sent' },
  drafts: { label: 'Drafts', role: 'drafts' },
  archive: { label: 'Archive', role: 'archive' },
  spam: { label: 'Spam', role: 'junk' },
  trash: { label: 'Trash', role: 'trash' },
};

export function encodeFolder(path) {
  return encodeURIComponent(path);
}

export function decodeFolder(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * @param {string[]} slug
 * @param {URLSearchParams | Record<string, string>} searchParams
 */
export function parseMailRoute(slug = [], searchParams = new URLSearchParams()) {
  const get = (k) =>
    (searchParams instanceof URLSearchParams ? searchParams.get(k) : searchParams?.[k]) || '';
  const parts = [...slug];
  let view = parts.shift() || 'inbox';
  let folderPath = null;
  let role = null;
  let query = '';

  if (view === 'folder') {
    folderPath = decodeFolder(parts.shift() || '');
  } else if (view === 'search') {
    query = get('q');
    folderPath = get('in') ? decodeFolder(get('in')) : null;
  } else if (ROLE_VIEWS[view]) {
    role = ROLE_VIEWS[view].role;
  } else {
    view = 'inbox';
    role = 'inbox';
  }

  let threadUids = null;
  let messageUid = null;
  if (parts[0] === 'thread' && parts[1]) {
    threadUids = parts[1]
      .split('-')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  } else if (parts[0] === 'message' && parts[1]) {
    messageUid = Number(parts[1]) || null;
  }

  return {
    view,
    role,
    folderPath,
    query,
    threadUids,
    messageUid,
    folderOverride: get('folder') || null,
  };
}

export function viewHref({ view, folderPath, query }) {
  if (view === 'folder' && folderPath) return `/mail/folder/${encodeFolder(folderPath)}`;
  if (view === 'search')
    return `/mail/search?q=${encodeURIComponent(query || '')}${folderPath ? `&in=${encodeFolder(folderPath)}` : ''}`;
  return `/mail/${view}`;
}

export function threadHref(base, uids, folder) {
  const [path, qs] = base.split('?');
  const params = new URLSearchParams(qs || '');
  if (folder) params.set('folder', folder);
  const q = params.toString();
  return `${path}/thread/${uids.join('-')}${q ? `?${q}` : ''}`;
}

export function messageHref(base, uid, folder) {
  const [path, qs] = base.split('?');
  const params = new URLSearchParams(qs || '');
  if (folder) params.set('folder', folder);
  const q = params.toString();
  return `${path}/message/${uid}${q ? `?${q}` : ''}`;
}

/** Maps a folder model entry to its canonical view href. */
export function folderHref(folder) {
  if (!folder) return '/mail/inbox';
  if (folder.role === 'inbox') return '/mail/inbox';
  if (folder.role === 'junk') return '/mail/spam';
  if (folder.role && ROLE_VIEWS[folder.role]) return `/mail/${folder.role}`;
  return `/mail/folder/${encodeFolder(folder.path)}`;
}
