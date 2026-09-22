'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Monitor, LogOut, ShieldCheck, ShieldX } from 'lucide-react';
import { SettingsSection } from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
        description="Devices currently signed in to this mailbox."
      >
        {sessions.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sessions.isError ? (
          <p className="text-destructive p-4 text-sm">Unable to load sessions.</p>
        ) : (
          sessions.data.sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Monitor className="text-muted-foreground h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-center gap-2 truncate font-medium">
                  {describeUserAgent(s.userAgent)}
                  {s.current ? <Badge variant="success">This device</Badge> : null}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {s.ip ? `${s.ip} · ` : ''}Last active {formatRelative(s.lastSeenAt)} · Signed in{' '}
                  {formatFullDate(s.createdAt)}
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
            </div>
          ))
        )}
        <div className="px-4 py-3">
          <Button
            variant="destructive"
            onClick={() => revokeAll.mutate()}
            loading={revokeAll.isPending}
          >
            Sign out of all sessions
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Recent sign-ins">
        {lastLogin ? (
          <p className="px-4 py-3 text-sm">
            Last successful sign-in {formatFullDate(lastLogin.at)}
            {lastLogin.ip ? ` from ${lastLogin.ip}` : ''}.
          </p>
        ) : null}
        {(sessions.data?.loginHistory || []).map((h, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
            {h.success ? (
              <ShieldCheck className="text-success h-4 w-4" />
            ) : (
              <ShieldX className="text-destructive h-4 w-4" />
            )}
            <span className="flex-1 truncate">
              {h.success ? 'Successful sign-in' : 'Failed sign-in attempt'} ·{' '}
              {describeUserAgent(h.userAgent)}
            </span>
            <span className="text-muted-foreground text-xs">{formatFullDate(h.at)}</span>
          </div>
        ))}
      </SettingsSection>

      <SettingsSection title="Password">
        <p className="text-muted-foreground px-4 py-3 text-sm">
          Your password is managed by the mail server. Change it in the Mailcow user portal; all
          webmail sessions will then need to sign in again.
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
