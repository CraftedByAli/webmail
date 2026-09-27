'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsSection, ToggleRow } from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/ui/error-state';
import { useApi } from '@/hooks/use-account';
import { formatFullDate } from '@/utils/format';
import { cn } from '@/utils/cn';

export const FORWARDING_KEY = ['forwarding'];

function savedValue(data) {
  return {
    enabled: data.state !== 'off',
    addresses: data.addresses,
    keepCopy: data.keepCopy,
    skipSpam: data.skipSpam,
  };
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

function Notice({ tone = 'info', children }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      role={tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'text-ui rounded-control flex items-start gap-2 px-3 py-2',
        tone === 'success' && 'bg-success-subtle text-success',
        tone === 'warning' && 'bg-warning-subtle text-warning',
        tone === 'info' && 'bg-sunken text-fg-secondary'
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Per-mailbox forwarding. The rule lives on the mail server (a Sieve script),
 * so mail keeps being forwarded while nobody is signed in.
 */
export function ForwardingSettings({ session }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const mailbox = session.user.email;
  const query = useQuery({
    queryKey: FORWARDING_KEY,
    queryFn: () => api.get('/api/forwarding'),
    staleTime: 30_000,
  });

  // Unsaved edits; null means "show what the server has".
  const [edits, setDraft] = useState(null);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const draft = edits ?? (query.data ? savedValue(query.data) : null);

  const save = useMutation({
    mutationFn: (value) => api.put('/api/forwarding', value),
    onSuccess: (data) => {
      queryClient.setQueryData(FORWARDING_KEY, data);
      setDraft(null);
      toast.success(
        data.enabled ? `Forwarding to ${data.addresses.join(', ')}` : 'Forwarding turned off'
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => api.post('/api/forwarding/test'),
    onSuccess: (res) =>
      toast.success('Test message sent', {
        description: `Check ${res.forwardedTo.join(', ')} in a minute.`,
      }),
    onError: (e) => toast.error(e.message),
  });

  const data = query.data;
  const max = data?.limits?.maxAddresses ?? 4;
  const allowed = data?.limits?.allowedDomains ?? [];

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(savedValue(data)) !== JSON.stringify(draft);
  }, [data, draft]);

  function validate(address) {
    if (!EMAIL_RE.test(address)) return `“${address}” is not a valid email address.`;
    if (address === mailbox) return 'A mailbox cannot forward to itself.';
    if (draft.addresses.includes(address)) return `${address} is already in the list.`;
    if (draft.addresses.length >= max)
      return `You can forward to at most ${max} address${max === 1 ? '' : 'es'}.`;
    const domain = address.split('@')[1];
    if (allowed.length && !allowed.includes(domain))
      return `Forwarding to ${domain} is not allowed. Allowed: ${allowed.join(', ')}.`;
    return '';
  }

  function addFromInput() {
    const parts = input
      .split(/[\s,;]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return true;
    let next = draft.addresses;
    for (const address of parts) {
      const error =
        validate(address) || (next.includes(address) ? `${address} is already in the list.` : '');
      if (error) {
        setInputError(error);
        return false;
      }
      next = [...next, address];
    }
    setDraft({ ...draft, addresses: next });
    setInput('');
    setInputError('');
    return true;
  }

  function submit(event) {
    event?.preventDefault();
    if (input.trim() && !addFromInput()) return;
    const pending = input.trim()
      ? [
          ...draft.addresses,
          ...input
            .split(/[\s,;]+/)
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean),
        ]
      : draft.addresses;
    const value = { ...draft, addresses: [...new Set(pending)] };
    if (value.enabled && value.addresses.length === 0) {
      setInputError('Add the address mail should be forwarded to.');
      return;
    }
    save.mutate(value);
  }

  if (query.isPending) {
    return (
      <SettingsSection title="Forwarding">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </SettingsSection>
    );
  }
  if (query.isError) {
    return (
      <SettingsSection title="Forwarding">
        <InlineError
          message={query.error?.message || 'Forwarding settings could not be loaded.'}
          onRetry={() => query.refetch()}
        />
      </SettingsSection>
    );
  }

  if (!data.available) {
    return (
      <SettingsSection
        title="Forwarding"
        description={`Automatically send a copy of new mail for ${mailbox} to another address.`}
      >
        <Notice tone="warning">{data.message || 'Forwarding is not available right now.'}</Notice>
        <div>
          <Button variant="default" onClick={() => query.refetch()} loading={query.isFetching}>
            Try again
          </Button>
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Forwarding"
      description={`Automatically send new mail that arrives in ${mailbox} to other addresses. It runs on the mail server, so it keeps working when you are signed out.`}
    >
      {data.state === 'active' ? (
        <Notice tone="success">
          New mail is being forwarded to <b>{data.addresses.join(', ')}</b>
          {data.keepCopy ? ' and kept in this mailbox.' : '. Copies are not kept here.'}
          {data.updatedAt ? (
            <span className="text-caption block opacity-80">
              Updated {formatFullDate(data.updatedAt)}
            </span>
          ) : null}
        </Notice>
      ) : data.state === 'overridden' ? (
        <Notice tone="warning">
          Forwarding is switched on here, but another app activated a different filter
          {data.otherScript ? ` (“${data.otherScript}”)` : ''}, so mail is not being forwarded. Save
          to turn forwarding back on — your other filters will keep working.
        </Notice>
      ) : null}

      <form onSubmit={submit} className="grid gap-5" noValidate>
        <ToggleRow
          id="forwarding-enabled"
          label="Forward incoming mail"
          description="When off, nothing is forwarded. Your list of addresses is kept for next time."
          checked={draft.enabled}
          onChange={(enabled) => setDraft({ ...draft, enabled })}
        />

        <Field
          label="Forward to"
          htmlFor="forwarding-address"
          error={inputError || undefined}
          help={
            inputError
              ? undefined
              : `Up to ${max} address${max === 1 ? '' : 'es'}. Press Enter to add.${
                  allowed.length ? ` Allowed domains: ${allowed.join(', ')}.` : ''
                }`
          }
        >
          <div className="grid gap-2">
            {draft.addresses.length ? (
              <ul
                className="flex flex-wrap gap-1.5"
                aria-label="Forwarding addresses"
                data-testid="forwarding-addresses"
              >
                {draft.addresses.map((address) => (
                  <li
                    key={address}
                    className="bg-accent-subtle text-accent-text rounded-pill text-ui flex items-center gap-1 py-0.5 pr-1 pl-2.5"
                  >
                    {address}
                    <button
                      type="button"
                      className="hover:bg-accent-subtle-strong rounded-pill grid size-5 place-items-center"
                      aria-label={`Remove ${address}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          addresses: draft.addresses.filter((a) => a !== address),
                        })
                      }
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <Input
                id="forwarding-address"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                placeholder="name@example.com"
                value={input}
                disabled={draft.addresses.length >= max}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (inputError) setInputError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addFromInput();
                  }
                }}
                onBlur={() => input.trim() && addFromInput()}
              />
              <Button
                type="button"
                variant="default"
                onClick={addFromInput}
                disabled={!input.trim() || draft.addresses.length >= max}
              >
                Add
              </Button>
            </div>
          </div>
        </Field>

        <ToggleRow
          id="forwarding-keep"
          label="Keep a copy in this mailbox"
          description={
            draft.keepCopy
              ? 'Forwarded mail also stays in this Inbox.'
              : 'Forwarded mail will NOT be stored here. If a forwarding address stops working, those messages are lost.'
          }
          checked={draft.keepCopy}
          onChange={(keepCopy) => setDraft({ ...draft, keepCopy })}
        />
        <ToggleRow
          id="forwarding-spam"
          label="Don’t forward spam"
          description="Messages the server flags as spam stay in Junk instead of being forwarded. Recommended: forwarding spam can get your domain blocklisted."
          checked={draft.skipSpam}
          onChange={(skipSpam) => setDraft({ ...draft, skipSpam })}
        />

        {data.otherScript && data.state !== 'overridden' ? (
          <Notice>
            Your existing server filter “{data.otherScript}” keeps running alongside forwarding.
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={!dirty && data.state !== 'overridden'}
            data-testid="forwarding-save"
          >
            Save changes
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setInput('');
                setInputError('');
              }}
            >
              Discard
            </Button>
          ) : null}
          {data.state === 'active' && !dirty ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => test.mutate()}
              loading={test.isPending}
            >
              <Send /> Send a test message
            </Button>
          ) : null}
        </div>
      </form>
    </SettingsSection>
  );
}
