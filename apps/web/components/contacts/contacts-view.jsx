'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Search, Pencil, Trash2, Mail } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-account';
import { useComposeStore } from '@/stores/compose-store';

export function ContactsView() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', company: '', notes: '' });
  const openCompose = useComposeStore((s) => s.open);

  const contacts = useQuery({
    queryKey: ['contacts', q],
    queryFn: () => api.get('/api/contacts', { q }),
  });
  const save = useMutation({
    mutationFn: (input) =>
      input.id ? api.put(`/api/contacts/${input.id}`, input) : api.post('/api/contacts', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setEditing(null);
      toast.success('Contact saved');
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact deleted');
    },
    onError: (e) => toast.error(e.message),
  });

  function openEditor(contact) {
    setForm(
      contact
        ? {
            id: contact.id,
            name: contact.name,
            email: contact.email,
            company: contact.company,
            notes: contact.notes,
          }
        : { name: '', email: '', company: '', notes: '' }
    );
    setEditing(contact || {});
  }

  return (
    <div className="bg-surface flex h-full min-h-0 flex-col">
      <div
        data-chrome
        className="border-line bg-canvas px-gutter flex h-11 shrink-0 items-center gap-2 border-b"
      >
        <IconButton label="Back to mail" onClick={() => router.push('/mail/inbox')}>
          <ArrowLeft />
        </IconButton>
        <h1 className="text-title text-fg font-semibold">Contacts</h1>
        <div className="relative ml-auto w-full max-w-56">
          <Search
            className="text-fg-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            aria-label="Search contacts"
            placeholder="Search contacts"
            className="bg-hover focus-visible:bg-surface border-transparent pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button variant="primary" size="sm" onClick={() => openEditor(null)}>
          <Plus /> <span className="hidden sm:inline">New contact</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        {contacts.isPending ? (
          <div className="px-gutter mx-auto grid max-w-3xl gap-2 py-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : contacts.isError ? (
          <ErrorState title="Contacts could not be loaded" onRetry={() => contacts.refetch()} />
        ) : contacts.data.contacts.length === 0 ? (
          <EmptyState
            title={q ? 'No contacts match' : 'No saved contacts'}
            description={
              q
                ? 'Try a different name, address or company.'
                : 'Addresses you write to are suggested automatically. Save a contact here to add a name, company and notes.'
            }
            action={
              !q ? (
                <Button variant="default" onClick={() => openEditor(null)}>
                  <Plus /> New contact
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-line px-gutter mx-auto max-w-3xl divide-y py-2">
            {contacts.data.contacts.map((c) => (
              <li key={c.id} className="group flex items-center gap-3 py-2.5">
                <Avatar address={{ name: c.name, address: c.email }} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg truncate font-medium">{c.name || c.email}</p>
                  <p className="text-caption text-fg-secondary truncate">
                    {c.email}
                    {c.company ? ` · ${c.company}` : ''}
                  </p>
                  {c.notes ? (
                    <p className="text-caption text-fg-muted truncate">{c.notes}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton
                    label={`Write to ${c.name || c.email}`}
                    size="icon-sm"
                    onClick={() =>
                      openCompose({ data: { to: [{ name: c.name, address: c.email }] } })
                    }
                  >
                    <Mail />
                  </IconButton>
                  <IconButton
                    label={`Edit ${c.name || c.email}`}
                    size="icon-sm"
                    onClick={() => openEditor(c)}
                  >
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label={`Delete ${c.name || c.email}`}
                    size="icon-sm"
                    onClick={() => remove.mutate(c.id)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
            className="contents"
          >
            <DialogHeader>
              <DialogTitle>{form.id ? 'Edit contact' : 'New contact'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <Field label="Email address" htmlFor="contact-email" required>
                <Input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  required
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Name" htmlFor="contact-name">
                <Input
                  id="contact-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Company" htmlFor="contact-company">
                <Input
                  id="contact-company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </Field>
              <Field label="Notes" htmlFor="contact-notes">
                <Textarea
                  id="contact-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Save contact
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
