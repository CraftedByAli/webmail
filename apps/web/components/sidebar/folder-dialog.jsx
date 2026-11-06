'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useFolderMutations } from '@/hooks/use-folders';

/** Create, rename and delete folders. Deletion is destructive and says so. */
export function FolderDialog({ state, onClose }) {
  const { create, rename, remove } = useFolderMutations();
  const [name, setName] = useState('');
  const [lastState, setLastState] = useState(state);
  const [error, setError] = useState('');
  const open = !!state;

  if (state !== lastState) {
    setLastState(state);
    setName(state?.mode === 'rename' ? state.folder.name : '');
    setError('');
  }

  async function submit(event) {
    event?.preventDefault();
    setError('');
    try {
      if (state.mode === 'create') {
        await create.mutateAsync({ name, parent: state.parent?.path });
        toast.success(`Folder “${name}” created`);
      } else if (state.mode === 'rename') {
        await rename.mutateAsync({ path: state.folder.path, name });
        toast.success('Folder renamed');
      } else if (state.mode === 'delete') {
        await remove.mutateAsync({ path: state.folder.path });
        toast.success('Folder deleted');
      }
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  const busy = create.isPending || rename.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {state?.mode === 'delete' ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete “{state.folder.name}”?</DialogTitle>
              <DialogDescription>
                Every message inside this folder is permanently deleted from the mail server. This
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p
                role="alert"
                className="bg-danger-subtle text-ui text-danger rounded-control px-3 py-2"
              >
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="danger" onClick={submit} loading={busy}>
                Delete folder
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="contents">
            <DialogHeader>
              <DialogTitle>
                {state?.mode === 'rename'
                  ? 'Rename folder'
                  : state?.parent
                    ? `New folder in ${state.parent.name}`
                    : 'New folder'}
              </DialogTitle>
              <DialogDescription>
                Folders live on the mail server, so they appear in every mail client you use.
              </DialogDescription>
            </DialogHeader>
            <Field label="Folder name" htmlFor="folder-name" error={error} required>
              <Input
                id="folder-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                invalid={!!error}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
                {state?.mode === 'rename' ? 'Rename' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
