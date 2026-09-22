'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { apiGet } from '@/utils/api-client';

export function DiagnosticsView() {
  const router = useRouter();
  const diag = useQuery({
    queryKey: ['diagnostics'],
    queryFn: () => apiGet('/api/admin/diagnostics'),
    refetchInterval: 30_000,
  });
  const d = diag.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <IconButton label="Back to mail" onClick={() => router.push('/mail/inbox')}>
          <ArrowLeft />
        </IconButton>
        <h1 className="text-base font-semibold">Diagnostics</h1>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => diag.refetch()}
          disabled={diag.isFetching}
        >
          <RefreshCw className={diag.isFetching ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto p-4 sm:p-6">
        {diag.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : diag.isError ? (
          <ErrorState
            title="Unable to load diagnostics"
            message={diag.error.message}
            onRetry={() => diag.refetch()}
          />
        ) : (
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <Card title="Application">
              <Row k="Version" v={d.version} />
              <Row k="Environment" v={d.environment} />
              <Row k="Provider" v={d.provider} />
              <Row k="Node" v={d.node} />
              <Row k="Uptime" v={`${Math.round(d.uptimeSeconds / 60)} min`} />
              <Row k="Memory (RSS)" v={`${d.memoryMb} MB`} />
            </Card>
            <Card title="IMAP">
              <Row k="Status" v={<Status ok={d.imap.ok} />} />
              <Row
                k="Server"
                v={`${d.imap.host}:${d.imap.port} ${d.imap.tls ? '(TLS)' : '(STARTTLS)'}`}
              />
              <Row k="Latency" v={`${d.imap.latencyMs ?? '–'} ms`} />
              <Row
                k="Pool"
                v={`${d.imap.pool.connections} connections (${d.imap.pool.busy} busy) across ${d.imap.pool.mailboxes} mailboxes`}
              />
              <Row
                k="IDLE listener"
                v={d.imap.idle.active ? `active (${d.imap.idle.refs} subscribers)` : 'inactive'}
              />
              {d.imap.error ? <Row k="Error" v={d.imap.error} /> : null}
            </Card>
            <Card title="SMTP">
              <Row k="Status" v={<Status ok={d.smtp.ok} />} />
              <Row
                k="Server"
                v={`${d.smtp.host}:${d.smtp.port} ${d.smtp.secure ? '(TLS)' : d.smtp.requireTLS ? '(STARTTLS required)' : '(STARTTLS optional)'}`}
              />
              <Row k="Latency" v={`${d.smtp.latencyMs ?? '–'} ms`} />
              {d.smtp.error ? <Row k="Error" v={d.smtp.error} /> : null}
            </Card>
            <Card title="Realtime & limits">
              <Row k="SSE subscribers" v={d.realtime.subscribers} />
              <Row
                k="Max attachment"
                v={`${Math.round(d.limits.maxAttachmentBytes / 1024 / 1024)} MB`}
              />
              <Row k="Max message" v={`${Math.round(d.limits.maxMessageBytes / 1024 / 1024)} MB`} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Status({ ok }) {
  return ok ? (
    <span className="text-success inline-flex items-center gap-1">
      <CheckCircle2 className="h-4 w-4" /> OK
    </span>
  ) : (
    <span className="text-destructive inline-flex items-center gap-1">
      <XCircle className="h-4 w-4" /> Failed
    </span>
  );
}

function Card({ title, children }) {
  return (
    <section className="border-border bg-card shadow-soft rounded-2xl border p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <dl className="space-y-1 text-sm">{children}</dl>
    </section>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
