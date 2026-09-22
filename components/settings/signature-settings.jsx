'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Star } from 'lucide-react';
import { SettingsSection } from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Badge } from '@/components/ui/badge';

export function SignatureSettings({ session }) {
  const signatures = session.signatures || [];
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null | {} | signature
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
      description="Appended to new messages. The default signature is inserted automatically."
    >
      {signatures.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-sm">No signatures yet.</p>
      ) : null}
      {signatures.map((sig) => (
        <div key={sig.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {sig.name}{' '}
              {sig.isDefault ? (
                <Badge variant="secondary">
                  <Star className="mr-1 h-3 w-3" /> Default
                </Badge>
              ) : null}
            </p>
            <div
              className="prose-mail text-muted-foreground mt-1 max-h-24 overflow-hidden text-xs"
              dangerouslySetInnerHTML={{ __html: sig.html }}
            />
          </div>
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
      ))}
      <div className="px-4 py-3">
        <Button variant="outline" onClick={() => openEditor(null)}>
          <Plus /> New signature
        </Button>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit signature' : 'New signature'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sig-name">Name</Label>
              <Input
                id="sig-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={100}
              />
            </div>
            <div className="border-border rounded-lg border p-2">
              <RichTextEditor
                initialHtml={form.html}
                onChange={(html) => setForm((f) => ({ ...f, html }))}
                placeholder="Your signature…"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => setForm({ ...form, isDefault: v })}
              />{' '}
              Use as default signature
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              loading={save.isPending}
              disabled={!form.name.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
