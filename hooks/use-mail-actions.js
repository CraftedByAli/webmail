'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-account';
import { FOLDERS_KEY } from '@/hooks/use-folders';
import { useUiStore } from '@/stores/ui-store';

const REMOVING_ACTIONS = new Set([
  'archive',
  'trash',
  'delete',
  'spam',
  'notSpam',
  'restore',
  'move',
]);

const LABELS = {
  read: 'Marked as read',
  unread: 'Marked as unread',
  star: 'Starred',
  unstar: 'Unstarred',
  archive: 'Archived',
  trash: 'Moved to Trash',
  delete: 'Deleted permanently',
  spam: 'Reported as spam',
  notSpam: 'Moved to Inbox',
  restore: 'Moved to Inbox',
  move: 'Moved',
};

function itemUids(item) {
  return item.type === 'thread' ? item.uids : [item.uid];
}

function applyFlagPatch(item, action) {
  const flags = { ...item.flags };
  const patch = { ...item };
  switch (action) {
    case 'read':
      flags.seen = true;
      if (item.type === 'thread') patch.unread = false;
      break;
    case 'unread':
      flags.seen = false;
      if (item.type === 'thread') patch.unread = true;
      break;
    case 'star':
      flags.flagged = true;
      if (item.type === 'thread') patch.starred = true;
      break;
    case 'unstar':
      flags.flagged = false;
      if (item.type === 'thread') patch.starred = false;
      break;
    default:
      return item;
  }
  return { ...patch, flags };
}

/**
 * Applies an optimistic patch to every cached list and thread for a folder.
 * Returns a rollback function.
 */
function patchCaches(queryClient, { folder, uids, action }) {
  const uidSet = new Set(uids);
  const snapshots = [];
  const removing = REMOVING_ACTIONS.has(action);

  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['messages'] })) {
    const params = query.queryKey[1] || {};
    const data = query.state.data;
    if (!data?.pages) continue;
    const isStarredView = params.role === 'starred';
    if (params.folder !== folder && !isStarredView) continue;

    snapshots.push([query.queryKey, data]);
    const pages = data.pages.map((page) => {
      let items = page.items;
      let total = page.total;
      if (removing || (isStarredView && action === 'unstar')) {
        const before = items.length;
        items = items.filter(
          (item) =>
            !(item.folder === folder || isStarredView) || !itemUids(item).some((u) => uidSet.has(u))
        );
        total = Math.max(0, total - (before - items.length));
      } else {
        items = items.map((item) =>
          itemUids(item).some((u) => uidSet.has(u)) ? applyFlagPatch(item, action) : item
        );
      }
      return { ...page, items, total };
    });
    queryClient.setQueryData(query.queryKey, { ...data, pages });
  }

  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['thread', folder] })) {
    const data = query.state.data;
    if (!data?.messages) continue;
    snapshots.push([query.queryKey, data]);
    const messages = data.messages.map((m) => (uidSet.has(m.uid) ? applyFlagPatch(m, action) : m));
    queryClient.setQueryData(query.queryKey, {
      ...data,
      messages,
      unread: messages.some((m) => !m.flags.seen),
      starred: messages.some((m) => m.flags.flagged),
    });
  }

  return () => {
    for (const [key, data] of snapshots) queryClient.setQueryData(key, data);
  };
}

/**
 * Bulk mail actions with optimistic UI and rollback.
 */
export function useMailActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const clearSelection = useUiStore((s) => s.clearSelection);

  const run = useCallback(
    async ({ action, folder, uids, destination, silent = false, undo }) => {
      if (!folder || !uids?.length) return false;
      const rollback = patchCaches(queryClient, { folder, uids, action });
      clearSelection();
      try {
        await api.post('/api/mail/actions', { action, folder, uids, destination });
        if (!silent) {
          const label =
            action === 'move' && destination ? `Moved to ${destination}` : LABELS[action];
          const count = uids.length;
          toast.success(
            count > 1 ? `${label} · ${count} messages` : label,
            undo ? { action: { label: 'Undo', onClick: undo } } : undefined
          );
        }
        queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
        if (REMOVING_ACTIONS.has(action)) {
          setTimeout(() => queryClient.invalidateQueries({ queryKey: ['messages'] }), 800);
          queryClient.invalidateQueries({ queryKey: ['thread', folder] });
        }
        return true;
      } catch (error) {
        rollback();
        toast.error(error.message || 'Unable to complete that action. Try again.');
        return false;
      }
    },
    [api, queryClient, clearSelection]
  );

  return {
    run,
    markRead: (folder, uids) => run({ action: 'read', folder, uids, silent: true }),
    markUnread: (folder, uids) => run({ action: 'unread', folder, uids }),
    star: (folder, uids) => run({ action: 'star', folder, uids, silent: true }),
    unstar: (folder, uids) => run({ action: 'unstar', folder, uids, silent: true }),
    archive: (folder, uids) => run({ action: 'archive', folder, uids }),
    trash: (folder, uids) => run({ action: 'trash', folder, uids }),
    deleteForever: (folder, uids) => run({ action: 'delete', folder, uids }),
    spam: (folder, uids) => run({ action: 'spam', folder, uids }),
    notSpam: (folder, uids) => run({ action: 'notSpam', folder, uids }),
    restore: (folder, uids) => run({ action: 'restore', folder, uids }),
    move: (folder, uids, destination) => run({ action: 'move', folder, uids, destination }),
  };
}
