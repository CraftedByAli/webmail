'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-account';

export const SESSION_KEY = ['session'];

/** Current user, preferences and signatures. */
export function useSession() {
  const api = useApi();
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => api.get('/api/auth/session'),
    staleTime: 5 * 60_000,
  });
}

export function usePreferences() {
  const { data } = useSession();
  return data?.preferences;
}

export function useUpdatePreferences() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch) => api.patch('/api/preferences', patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: SESSION_KEY });
      const previous = queryClient.getQueryData(SESSION_KEY);
      if (previous) {
        const next = { ...previous, preferences: { ...previous.preferences } };
        for (const section of Object.keys(patch)) {
          next.preferences[section] = {
            ...(previous.preferences[section] || {}),
            ...patch[section],
          };
        }
        queryClient.setQueryData(SESSION_KEY, next);
      }
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(SESSION_KEY, ctx.previous);
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(SESSION_KEY, (old) => (old ? { ...old, preferences } : old));
    },
  });
}
