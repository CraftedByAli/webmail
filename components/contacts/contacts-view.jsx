'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Search, Pencil, Trash2, Mail, Users } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { apiDelete, apiGet, apiPost, apiPut } from '@/utils/api-client';
import { useComposeStore } from '@/stores/compose-store';

export function ContactsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', company: '', notes: '' });
  const openCompose = useComposeStore((s) => s.open);

  const contacts = useQuery({
    queryKey: ['contacts', q],
    queryFn: () => apiGet('/api/contacts', { q }),
  });
  const save = useMutation({
    mutationFn: (input) =>
      input.id ? apiPut(`/api/contacts/${input.id}`, input) : apiPost('/api/contacts', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setEditing(null);
      toast.success('Contact saved');
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => apiDelete(`/api/contacts/${id}`),
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <IconButton label="Back to mail" onClick={() => router.push('/mail/inbox')}>
          <ArrowLeft />
        </IconButton>
        <h1 className="text-base font-semibold">Contacts</h1>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            aria-label="Search contacts"
            placeholder="Search"
            className="h-9 pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => openEditor(null)}>
          <Plus /> <span className="hidden sm:inline">New contact</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        {contacts.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : contacts.isError ? (
          <ErrorState title="Unable to load contacts" onRetry={() => contacts.refetch()} />
        ) : contacts.data.contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q ? 'No contacts match' : 'No contacts yet'}
            description="Addresses you email are suggested automatically. Save contacts here to add names, companies and notes."
            action={
              <Button onClick={() => openEditor(null)}>
                <Plus /> New contact
              </Button>
            }
          />
        ) : (
          <ul className="divide-border mx-auto max-w-3xl divide-y p-2 sm:p-4">
            {contacts.data.contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <Avatar address={{ name: c.name, address: c.email }} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name || c.email}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {c.email}
                    {c.company ? ` · ${c.company}` : ''}
                  </p>
                  {c.notes ? (
                    <p className="text-muted-foreground truncate text-xs">{c.notes}</p>
                  ) : null}
                </div>
                <IconButton
                  label={`Email ${c.name || c.email}`}
                  onClick={() =>
                    openCompose({ data: { to: [{ name: c.name, address: c.email }] } })
                  }
                >
                  <Mail />
                </IconButton>
                <IconButton label={`Edit ${c.name || c.email}`} onClick={() => openEditor(c)}>
                  <Pencil />
                </IconButton>
                <IconButton
                  label={`Delete ${c.name || c.email}`}
                  onClick={() => remove.mutate(c.id)}
                >
                  <Trash2 />
                </IconButton>
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
            <div className="space-y-3">
              {[
                ['name', 'Name', 'text'],
                ['email', 'Email', 'email'],
                ['company', 'Company', 'text'],
              ].map(([key, label, type]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`contact-${key}`}>{label}</Label>
                  <Input
                    id={`contact-${key}`}
                    type={type}
                    value={form[key]}
                    required={key === 'email'}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="contact-notes">Notes</Label>
                <Textarea
                  id="contact-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
