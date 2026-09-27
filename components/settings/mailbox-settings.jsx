'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, KeyRound, LogOut, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsSection } from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { MailboxAvatar, useAddMailboxDialog } from '@/components/layout/account-switcher';
import { useAccountStore } from '@/stores/account-store';
import { useAccountActions } from '@/hooks/use-accounts';
import { api } from '@/utils/api-client';

/** Every mailbox signed in on this device, with switch / reorder / sign-out. */
export function MailboxSettings() {
  const accounts = useAccountStore((s) => s.accounts);
  const active = useAccountStore((s) => s.active);
  const max = useAccountStore((s) => s.max);
  const showAdd = useAddMailboxDialog((s) => s.show);
  const { switchTo, signOutMailbox } = useAccountActions();
  const [busy, setBusy] = useState(null);

  async function move(index, delta) {
    const order = accounts.map((a) => a.email);
    const [item] = order.splice(index, 1);
    order.splice(index + delta, 0, item);
    try {
      const res = await api('/api/auth/accounts', {
        method: 'PATCH',
        json: { order },
        account: null,
      });
      useAccountStore.getState().setAccounts(
        res.accounts.map((a) => ({
          ...a,
          status: accounts.find((x) => x.email === a.email)?.status,
        })),
        res.max
      );
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function signOut(email) {
    setBusy(email);
    try {
      await signOutMailbox(email);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSection
      title="Mailboxes"
      description="Stay signed in to several mailboxes on this device and switch between them from the sidebar or with g then 1–9. Each mailbox keeps its own mail, folders, contacts, signatures, forwarding and settings."
    >
      <ul className="divide-line border-line divide-y border-y" data-testid="mailbox-list">
        {accounts.map((a, index) => {
          const needsAuth = a.status?.state === 'reauth';
          return (
            <li key={a.email} className="flex items-center gap-3 py-2.5">
              <MailboxAvatar email={a.email} />
              <div className="min-w-0 flex-1">
                <p className="text-ui text-fg flex items-center gap-2 truncate">
                  <span className="truncate">{a.email}</span>
                  {a.email === active ? <Badge variant="accent">Viewing</Badge> : null}
                  {needsAuth ? <Badge variant="warning">Sign in again</Badge> : null}
                </p>
                <p className="text-caption text-fg-muted truncate">
                  {needsAuth
                    ? a.status.message
                    : a.status?.state === 'ok'
                      ? `${a.status.unread} unread in Inbox`
                      : a.status?.state === 'error'
                        ? a.status.message
                        : index < 9
                          ? `Shortcut: g then ${index + 1}`
                          : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {needsAuth ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => showAdd({ email: a.email, reason: 'reauth' })}
                  >
                    <KeyRound /> Sign in
                  </Button>
                ) : a.email !== active ? (
                  <Button variant="ghost" size="sm" onClick={() => switchTo(a.email)}>
                    Open
                  </Button>
                ) : null}
                <IconButton
                  label="Move up"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label="Move down"
                  size="icon-sm"
                  disabled={index === accounts.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </IconButton>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => signOut(a.email)}
                  loading={busy === a.email}
                >
                  <LogOut /> Sign out
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="default" onClick={() => showAdd()} disabled={accounts.length >= max}>
          <Plus /> Add another mailbox
        </Button>
        <span className="text-caption text-fg-muted">
          {accounts.length} of {max} mailboxes
        </span>
      </div>
    </SettingsSection>
  );
}
