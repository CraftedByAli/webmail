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
import { Label } from '@/components/ui/label';
import { useFolderMutations } from '@/hooks/use-folders';

/** Create / rename / delete folder dialogs. */
export function FolderDialog({ state, onClose }) {
  const { create, rename, remove } = useFolderMutations();
  const [name, setName] = useState('');
  const [lastState, setLastState] = useState(state);
  const open = !!state;

  // Reset the input whenever a different dialog is opened.
  if (state !== lastState) {
    setLastState(state);
    setName(state?.mode === 'rename' ? state.folder.name : '');
  }

  async function submit(event) {
    event?.preventDefault();
    try {
      if (state.mode === 'create') {
        await create.mutateAsync({ name, parent: state.parent?.path });
        toast.success('Folder created');
      } else if (state.mode === 'rename') {
        await rename.mutateAsync({ path: state.folder.path, name });
        toast.success('Folder renamed');
      } else if (state.mode === 'delete') {
        await remove.mutateAsync({ path: state.folder.path });
        toast.success('Folder deleted');
      }
      onClose();
    } catch (error) {
      toast.error(error.message);
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
                Messages inside this folder will be permanently deleted from the mail server. This
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={submit} loading={busy}>
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
                Folders are stored on the mail server and visible in every mail client.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!name.trim()}>
                {state?.mode === 'rename' ? 'Rename' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
