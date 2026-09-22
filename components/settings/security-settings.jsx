'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Monitor, Smartphone, LogOut, Check, X } from 'lucide-react';
import { SettingsSection } from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/ui/error-state';
import { apiDelete, apiGet, apiPost } from '@/utils/api-client';
import { formatFullDate, formatRelative } from '@/utils/format';

export function SecuritySettings() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiGet('/api/auth/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (id) => apiDelete('/api/auth/sessions', { id }),
    onSuccess: (res) => {
      if (res.current) router.replace('/login');
      else {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        toast.success('Session signed out');
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeAll = useMutation({
    mutationFn: () => apiPost('/api/auth/logout-all'),
    onSuccess: () => router.replace('/login'),
    onError: (e) => toast.error(e.message),
  });

  const lastLogin = sessions.data?.loginHistory?.find((h) => h.success);

  return (
    <>
      <SettingsSection
        title="Active sessions"
        description="Every browser currently signed in to this mailbox. Revoking a session signs it out immediately."
      >
        {sessions.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sessions.isError ? (
          <InlineError message="Sessions could not be loaded." onRetry={() => sessions.refetch()} />
        ) : (
          <ul className="divide-line border-line divide-y border-y">
            {sessions.data.sessions.map((s) => {
              const mobile = /iPhone|iPad|Android/i.test(s.userAgent || '');
              const Icon = mobile ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <Icon className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-ui text-fg flex items-center gap-2 truncate">
                      {describeUserAgent(s.userAgent)}
                      {s.current ? <Badge variant="success">This device</Badge> : null}
                    </p>
                    <p className="text-caption text-fg-muted truncate">
                      {s.ip ? `${s.ip} · ` : ''}active {formatRelative(s.lastSeenAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(s.id)}
                    loading={revoke.isPending && revoke.variables === s.id}
                  >
                    <LogOut /> {s.current ? 'Sign out' : 'Revoke'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div>
          <Button variant="danger" onClick={() => revokeAll.mutate()} loading={revokeAll.isPending}>
            Sign out of all sessions
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Recent sign-ins"
        description={
          lastLogin
            ? `Last successful sign-in ${formatFullDate(lastLogin.at)}${lastLogin.ip ? ` from ${lastLogin.ip}` : ''}.`
            : undefined
        }
      >
        <ul className="divide-line border-line divide-y border-y">
          {(sessions.data?.loginHistory || []).map((h, i) => (
            <li key={i} className="text-ui flex items-center gap-3 py-2">
              {h.success ? (
                <Check className="text-success size-4 shrink-0" aria-hidden="true" />
              ) : (
                <X className="text-danger size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="text-fg-secondary min-w-0 flex-1 truncate">
                {h.success ? 'Signed in' : 'Failed attempt'} · {describeUserAgent(h.userAgent)}
                {h.ip ? ` · ${h.ip}` : ''}
              </span>
              <time className="text-caption text-fg-muted shrink-0">{formatFullDate(h.at)}</time>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Password">
        <p className="text-body text-fg-secondary max-w-prose">
          Your password belongs to the mail server, not to this application. Change it in your mail
          server&apos;s own control panel; every webmail session will then need to sign in again.
        </p>
      </SettingsSection>
    </>
  );
}

function describeUserAgent(ua = '') {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua) && !/Chrome/.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : 'Browser';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}
