'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { SettingsSection } from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RichTextEditor } from '@/components/compose/rich-text-editor';
import { apiDelete, apiPost, apiPut } from '@/utils/api-client';
import { SESSION_KEY } from '@/hooks/use-session';

export function SignatureSettings({ session }) {
  const signatures = session.signatures || [];
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', html: '', isDefault: false });

  const refresh = () => queryClient.invalidateQueries({ queryKey: SESSION_KEY });
  const save = useMutation({
    mutationFn: (input) =>
      input.id ? apiPut(`/api/signatures/${input.id}`, input) : apiPost('/api/signatures', input),
    onSuccess: () => {
      refresh();
      setEditing(null);
      toast.success('Signature saved');
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => apiDelete(`/api/signatures/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Signature deleted');
    },
    onError: (e) => toast.error(e.message),
  });

  function openEditor(sig) {
    setForm(
      sig
        ? { id: sig.id, name: sig.name, html: sig.html, isDefault: sig.isDefault }
        : { name: '', html: '', isDefault: signatures.length === 0 }
    );
    setEditing(sig || {});
  }

  return (
    <SettingsSection
      title="Signatures"
      description="The default signature is added to new messages and replies automatically."
    >
      {signatures.length === 0 ? (
        <p className="text-body text-fg-muted">You have not created a signature yet.</p>
      ) : (
        <ul className="divide-line border-line divide-y border-y">
          {signatures.map((sig) => (
            <li key={sig.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-ui text-fg flex items-center gap-2 font-medium">
                  {sig.name}
                  {sig.isDefault ? <Badge variant="accent">Default</Badge> : null}
                </p>
                <div
                  className="prose-app text-caption mt-1 max-h-20 overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: sig.html }}
                />
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${sig.name}`}
                  onClick={() => openEditor(sig)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${sig.name}`}
                  onClick={() => remove.mutate(sig.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button variant="default" onClick={() => openEditor(null)}>
          <Plus /> New signature
        </Button>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit signature' : 'New signature'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field
              label="Name"
              htmlFor="sig-name"
              help="Only you see this — it identifies the signature."
            >
              <Input
                id="sig-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={100}
              />
            </Field>
            <div className="border-line-strong rounded-control border p-2">
              <RichTextEditor
                initialHtml={form.html}
                onChange={(html) => setForm((f) => ({ ...f, html }))}
                placeholder="Your name, role, and anything else you sign off with…"
              />
            </div>
            <label className="text-ui text-fg flex items-center gap-2">
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => setForm({ ...form, isDefault: v })}
              />
              Use as my default signature
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => save.mutate(form)}
              loading={save.isPending}
              disabled={!form.name.trim()}
            >
              Save signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
