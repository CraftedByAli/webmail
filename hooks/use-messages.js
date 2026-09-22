'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/utils/api-client';

export const listKey = (params) => ['messages', params];
export const threadKey = (folder, uids) => [
  'thread',
  folder,
  [...uids].sort((a, b) => a - b).join(','),
];
export const messageKey = (folder, uid, images) => ['message', folder, uid, !!images];

/**
 * Infinite, paged message/conversation list for a folder or search.
 * @param {{ folder: string|null, role?: string, query?: string, conversation: boolean, pageSize: number, enabled?: boolean }} params
 */
export function useMessageList(params) {
  const { folder, role, query, conversation, pageSize, enabled = true } = params;
  return useInfiniteQuery({
    queryKey: listKey({ folder, role, query, conversation, pageSize }),
    queryFn: ({ pageParam = 0 }) =>
      apiGet('/api/mail/messages', {
        folder,
        role,
        q: query,
        conversation: conversation ? 1 : 0,
        page: pageParam,
        pageSize,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const loaded = (lastPage.page + 1) * lastPage.pageSize;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    enabled: enabled && !!folder,
    staleTime: 10_000,
  });
}

export function useThread(folder, uids, options = {}) {
  return useQuery({
    queryKey: threadKey(folder, uids || []),
    queryFn: () => apiGet('/api/mail/threads', { folder, uids: uids.join(',') }),
    enabled: !!folder && Array.isArray(uids) && uids.length > 0 && options.enabled !== false,
    staleTime: 30_000,
  });
}

export function useMessage(folder, uid, { images = false, enabled = true, markRead = true } = {}) {
  return useQuery({
    queryKey: messageKey(folder, uid, images),
    queryFn: () =>
      apiGet(`/api/mail/messages/${uid}`, {
        folder,
        images: images ? 1 : 0,
        markRead: markRead ? 1 : 0,
      }),
    enabled: enabled && !!folder && !!uid,
    staleTime: 5 * 60_000,
  });
}
