'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-account';

/**
 * Operator view. Dense on purpose: whoever opens this is diagnosing a problem
 * and wants every value visible at once, aligned and comparable.
 */
export function DiagnosticsView() {
  const api = useApi();
  const router = useRouter();
  const diag = useQuery({
    queryKey: ['diagnostics'],
    queryFn: () => api.get('/api/admin/diagnostics'),
    refetchInterval: 30_000,
  });
  const d = diag.data;

  return (
    <div className="bg-surface flex h-full min-h-0 flex-col">
      <div
        data-chrome
        className="border-line bg-canvas px-gutter flex h-11 shrink-0 items-center gap-1 border-b"
      >
        <IconButton label="Back to mail" onClick={() => router.push('/mail/inbox')}>
          <ArrowLeft />
        </IconButton>
        <h1 className="text-title text-fg font-semibold">Diagnostics</h1>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => diag.refetch()}
          disabled={diag.isFetching}
        >
          <RefreshCw className={diag.isFetching ? 'animate-spin' : undefined} /> Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <div className="px-gutter mx-auto max-w-3xl py-7">
          {diag.isPending ? (
            <div className="grid gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : diag.isError ? (
            <ErrorState
              title="Diagnostics unavailable"
              message={diag.error.message}
              onRetry={() => diag.refetch()}
            />
          ) : (
            <div className="grid gap-7">
              <Group title="Mail server">
                <Row k="IMAP" v={<Status ok={d.imap.ok} />} />
                <Row
                  k="IMAP host"
                  v={`${d.imap.host}:${d.imap.port}`}
                  note={d.imap.tls ? 'implicit TLS' : 'STARTTLS'}
                />
                <Row
                  k="IMAP latency"
                  v={d.imap.latencyMs != null ? `${d.imap.latencyMs} ms` : '—'}
                />
                {d.imap.error ? (
                  <Row k="IMAP error" v={<span className="text-danger">{d.imap.error}</span>} />
                ) : null}
                <Row k="SMTP" v={<Status ok={d.smtp.ok} />} />
                <Row
                  k="SMTP host"
                  v={`${d.smtp.host}:${d.smtp.port}`}
                  note={
                    d.smtp.secure
                      ? 'implicit TLS'
                      : d.smtp.requireTLS
                        ? 'STARTTLS required'
                        : 'STARTTLS optional'
                  }
                />
                <Row
                  k="SMTP latency"
                  v={d.smtp.latencyMs != null ? `${d.smtp.latencyMs} ms` : '—'}
                />
                {d.smtp.error ? (
                  <Row k="SMTP error" v={<span className="text-danger">{d.smtp.error}</span>} />
                ) : null}
              </Group>

              {d.sieve ? (
                <Group title="ManageSieve (forwarding)">
                  <Row k="Status" v={d.sieve.disabled ? 'Disabled' : <Status ok={d.sieve.ok} />} />
                  <Row k="Server" v={`${d.sieve.host}:${d.sieve.port}`} />
                  <Row
                    k="Latency"
                    v={d.sieve.latencyMs != null ? `${d.sieve.latencyMs} ms` : '—'}
                  />
                  {d.sieve.error ? (
                    <Row k="Error" v={<span className="text-danger">{d.sieve.error}</span>} />
                  ) : null}
                </Group>
              ) : null}

              <Group title="Connections">
                <Row
                  k="IMAP pool"
                  v={`${d.imap.pool.connections} open`}
                  note={`${d.imap.pool.busy} busy · ${d.imap.pool.mailboxes} mailboxes`}
                />
                <Row
                  k="IDLE listener"
                  v={d.imap.idle.active ? 'Active' : 'Inactive'}
                  note={
                    d.imap.idle.active
                      ? `${d.imap.idle.refs} subscriber(s)`
                      : 'starts with the first open tab'
                  }
                />
                <Row k="Live update clients" v={d.realtime.subscribers} />
              </Group>

              <Group title="Application">
                <Row k="Version" v={d.version} />
                <Row
                  k="Environment"
                  v={d.environment}
                  note={d.provider !== 'imap' ? `provider: ${d.provider}` : null}
                />
                <Row k="Node" v={d.node} />
                <Row k="Uptime" v={formatUptime(d.uptimeSeconds)} />
                <Row k="Memory (RSS)" v={`${d.memoryMb} MB`} />
                <Row
                  k="Max attachment"
                  v={`${Math.round(d.limits.maxAttachmentBytes / 1024 / 1024)} MB`}
                />
                <Row
                  k="Max message"
                  v={`${Math.round(d.limits.maxMessageBytes / 1024 / 1024)} MB`}
                />
              </Group>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section>
      <h2 className="text-meta text-fg-muted mb-2 font-semibold tracking-wide uppercase">
        {title}
      </h2>
      <dl className="divide-line border-line divide-y border-y">{children}</dl>
    </section>
  );
}

function Row({ k, v, note }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-baseline gap-3 py-2">
      <dt className="text-ui text-fg-secondary">{k}</dt>
      <dd className="text-ui text-fg">
        <span data-numeric>{v}</span>
        {note ? <span className="text-caption text-fg-muted ml-2">{note}</span> : null}
      </dd>
    </div>
  );
}

function Status({ ok }) {
  return <Badge variant={ok ? 'success' : 'danger'}>{ok ? 'Connected' : 'Failed'}</Badge>;
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
