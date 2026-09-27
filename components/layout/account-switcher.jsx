'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Eye,
  EyeOff,
  LogOut,
  Plus,
  Settings2,
} from 'lucide-react';
import { create } from 'zustand';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccountStore } from '@/stores/account-store';
import { useAccountActions } from '@/hooks/use-accounts';
import { cn } from '@/utils/cn';

/** Opens the "add mailbox" dialog from anywhere (menus, settings, re-auth prompts). */
export const useAddMailboxDialog = create((set) => ({
  open: false,
  email: '',
  reason: null,
  openId: 0,
  show: ({ email = '', reason = null } = {}) =>
    set((s) => ({ open: true, email, reason, openId: s.openId + 1 })),
  hide: () => set({ open: false }),
}));

const HUES = [221, 262, 187, 142, 24, 330, 45, 200];

function hueFor(email = '') {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

/**
 * Mailbox identity: a stable colour per address, so it is obvious at a
 * glance which mailbox is on screen. (Sender avatars stay monochrome.)
 */
export function MailboxAvatar({ email, size = 'md', className }) {
  const hue = hueFor(email);
  const local = (email || '?').split('@')[0];
  const initials = local
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'rounded-pill inline-grid shrink-0 place-items-center font-semibold text-white select-none',
        size === 'sm'
          ? 'text-meta size-6'
          : size === 'lg'
            ? 'text-caption size-9'
            : 'text-meta size-7',
        className
      )}
      style={{ backgroundColor: `hsl(${hue} 62% 46%)` }}
    >
      {initials || '?'}
    </span>
  );
}

function UnreadBadge({ status }) {
  if (!status) return null;
  if (status.state === 'reauth')
    return <AlertTriangle className="text-warning size-4" aria-label="Needs sign-in" />;
  if (status.state === 'error') return null;
  if (!status.unread) return null;
  return (
    <span
      className="bg-accent-subtle text-accent-text rounded-pill text-meta min-w-5 px-1.5 text-center font-semibold"
      data-numeric
      aria-label={`${status.unread} unread`}
    >
      {status.unread > 999 ? '999+' : status.unread}
    </span>
  );
}

/** Mailbox rows for a dropdown: switch, re-authenticate or add. */
export function MailboxMenuItems({ onNavigate }) {
  const accounts = useAccountStore((s) => s.accounts);
  const active = useAccountStore((s) => s.active);
  const max = useAccountStore((s) => s.max);
  const { switchTo } = useAccountActions();
  const showAdd = useAddMailboxDialog((s) => s.show);

  return (
    <>
      <DropdownMenuLabel>Mailboxes</DropdownMenuLabel>
      {accounts.map((a, index) => {
        const needsAuth = a.status?.state === 'reauth';
        return (
          <DropdownMenuItem
            key={a.email}
            onSelect={() => {
              if (needsAuth) showAdd({ email: a.email, reason: 'reauth' });
              else {
                switchTo(a.email);
                onNavigate?.();
              }
            }}
            className="gap-2.5"
            data-testid="mailbox-option"
            aria-current={a.email === active ? 'true' : undefined}
          >
            <MailboxAvatar email={a.email} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="text-ui text-fg block truncate">{a.email}</span>
              {needsAuth ? (
                <span className="text-meta text-warning block">Sign in again</span>
              ) : null}
            </span>
            <UnreadBadge status={a.status} />
            {a.email === active ? (
              <Check className="text-accent-text size-4" aria-label="Current mailbox" />
            ) : index < 9 ? (
              <DropdownMenuShortcut>g {index + 1}</DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
        );
      })}
      <DropdownMenuItem
        onSelect={() => showAdd()}
        disabled={accounts.length >= max}
        data-testid="add-mailbox"
      >
        <Plus /> Add another mailbox
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/settings?section=mailboxes">
          <Settings2 /> Manage mailboxes
        </Link>
      </DropdownMenuItem>
    </>
  );
}

/**
 * Sidebar header: which mailbox this is, one click to change. With several
 * mailboxes the total unread of the *other* mailboxes is shown so new mail
 * elsewhere is never missed.
 */
export function SidebarMailboxSwitcher({ onNavigate }) {
  const accounts = useAccountStore((s) => s.accounts);
  const active = useAccountStore((s) => s.active);
  const otherUnread = accounts
    .filter((a) => a.email !== active)
    .reduce((n, a) => n + (a.status?.unread || 0), 0);
  const otherNeedsAuth = accounts.some((a) => a.email !== active && a.status?.state === 'reauth');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-hover focus-visible:outline-focus rounded-control flex w-full items-center gap-2 px-1.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={`Current mailbox ${active}. Switch mailbox`}
          data-testid="mailbox-switcher"
        >
          <MailboxAvatar email={active} size="sm" />
          <span className="text-ui text-fg min-w-0 flex-1 truncate font-medium">{active}</span>
          {otherUnread > 0 || otherNeedsAuth ? (
            <span
              className={cn(
                'rounded-pill size-2 shrink-0',
                otherNeedsAuth ? 'bg-warning' : 'bg-accent'
              )}
              aria-label={
                otherNeedsAuth
                  ? 'Another mailbox needs attention'
                  : `${otherUnread} unread in other mailboxes`
              }
            />
          ) : null}
          <ChevronsUpDown className="text-fg-muted size-3.5 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <MailboxMenuItems onNavigate={onNavigate} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sign in to another mailbox (or re-enter a changed password) without leaving the app. */
export function AddMailboxDialog() {
  const { open, email, reason, openId, hide } = useAddMailboxDialog();
  const reauth = reason === 'reauth';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && hide()}>
      <DialogContent className="max-w-sm">
        <AddMailboxForm key={openId} presetEmail={email} reauth={reauth} onDone={hide} />
      </DialogContent>
    </Dialog>
  );
}

function AddMailboxForm({ presetEmail, reauth, onDone }) {
  const active = useAccountStore((s) => s.active);
  const accounts = useAccountStore((s) => s.accounts);
  const max = useAccountStore((s) => s.max);
  const { addMailbox } = useAccountActions();
  const [email, setEmail] = useState(presetEmail || '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const domain = (active || '').split('@')[1] || 'example.com';

  async function onSubmit(event) {
    event.preventDefault();
    let address = email.trim().toLowerCase();
    // "sales" is shorthand for sales@<current domain>: mailboxes usually share one.
    if (address && !address.includes('@')) address = `${address}@${domain}`;
    if (!address || !password) {
      setError('Enter the mailbox address and its password.');
      return;
    }
    if (!reauth && accounts.some((a) => a.email === address)) {
      setError(`${address} is already signed in. Pick it from the mailbox list.`);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await addMailbox({ email: address, password });
      onDone();
    } catch (err) {
      setError(err.message || 'Unable to sign in to that mailbox.');
      setLoading(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{reauth ? 'Sign in again' : 'Add a mailbox'}</DialogTitle>
        <DialogDescription>
          {reauth
            ? `The saved password for ${presetEmail} no longer works. Enter its current password.`
            : `Stay signed in to several mailboxes and switch between them. Each mailbox keeps its own mail, folders and settings. (${accounts.length} of ${max} used)`}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error ? (
          <p
            role="alert"
            className="bg-danger-subtle text-ui text-danger rounded-control px-3 py-2"
          >
            {error}
          </p>
        ) : null}
        <Field
          label="Mailbox address"
          htmlFor="add-mailbox-email"
          help={reauth ? undefined : `Just the name works too, e.g. "sales" for sales@${domain}.`}
        >
          <Input
            id="add-mailbox-email"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={!reauth}
            readOnly={reauth}
            placeholder={`sales@${domain}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="add-mailbox-password">
          <div className="relative">
            <Input
              id="add-mailbox-password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus={reauth}
              className="pr-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="text-fg-muted hover:bg-hover hover:text-fg rounded-control absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            data-testid="add-mailbox-submit"
          >
            {reauth ? 'Sign in' : 'Add mailbox'}
          </Button>
        </div>
      </form>
    </>
  );
}

/** Menu entries to sign out of the current mailbox or of all of them. */
export function SignOutMenuItems() {
  const accounts = useAccountStore((s) => s.accounts);
  const active = useAccountStore((s) => s.active);
  const { signOutMailbox, signOutAll } = useAccountActions();
  if (accounts.length <= 1) {
    return (
      <DropdownMenuItem onSelect={signOutAll}>
        <LogOut /> Sign out
      </DropdownMenuItem>
    );
  }
  return (
    <>
      <DropdownMenuItem
        onSelect={() => signOutMailbox(active).catch((e) => toast.error(e.message))}
      >
        <LogOut /> Sign out of this mailbox
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={signOutAll}>
        <LogOut /> Sign out of all mailboxes
      </DropdownMenuItem>
    </>
  );
}
