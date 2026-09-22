'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/utils/api-client';

export const FOLDERS_KEY = ['folders'];

export function useFolders() {
  return useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: () => apiGet('/api/folders'),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

/** Resolves the current view (role or explicit path) to a concrete folder. */
export function useResolvedFolder(route) {
  const { data } = useFolders();
  if (!data)
    return {
      folder: null,
      path: route.folderOverride || route.folderPath || (route.role === 'inbox' ? 'INBOX' : null),
      ready: false,
    };
  let path = route.folderOverride || route.folderPath;
  if (!path && route.role)
    path = route.role === 'starred' ? data.roles.inbox || 'INBOX' : data.roles[route.role] || null;
  const folder = data.folders.find((f) => f.path === path) || null;
  return { folder, path: path || 'INBOX', ready: true, roles: data.roles, folders: data.folders };
}

export function useFolderMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
  const create = useMutation({
    mutationFn: (input) => apiPost('/api/folders', input),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: (input) => apiPatch('/api/folders', input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (input) => apiDelete('/api/folders', input),
    onSuccess: invalidate,
  });
  return { create, rename, remove };
}
