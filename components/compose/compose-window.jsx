'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Paperclip,
  Trash2,
  Send,
  ChevronDown,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { RecipientInput } from '@/components/compose/recipient-input';
import { RichTextEditor } from '@/components/compose/rich-text-editor';
import { AttachmentPicker, useAttachmentUploads } from '@/components/compose/attachment-picker';
import { useComposeStore } from '@/stores/compose-store';
import { useSession } from '@/hooks/use-session';
import { apiPost, apiDelete } from '@/utils/api-client';
import { cn } from '@/utils/cn';

const AUTOSAVE_DELAY_MS = 3000;

/**
 * A single compose window (floating on desktop, full screen on mobile).
 */
export function ComposeWindow({ win, mobile = false, minimizedBar = false }) {
  const { id, data, mode, expanded, showCc, showBcc, loading } = win;
  const update = useComposeStore((s) => s.update);
  const updateData = useComposeStore((s) => s.updateData);
  const close = useComposeStore((s) => s.close);
  const minimize = useComposeStore((s) => s.minimize);
  const expand = useComposeStore((s) => s.expand);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const { uploads, addFiles, removeUpload, uploading } = useAttachmentUploads(id);
  const dropRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const signatures = session?.signatures || [];
  const title =
    mode === 'forward'
      ? 'Forward'
      : mode === 'reply' || mode === 'replyAll'
        ? 'Reply'
        : mode === 'draft'
          ? 'Draft'
          : 'New message';

  const attachments = useMemo(
    () => [
      ...(data.attachments || []),
      ...uploads.map((u) => ({
        id: u.id,
        source: 'upload',
        filename: u.name,
        size: u.size,
        contentType: u.type,
        progress: u.progress,
        error: u.error,
        uploadId: u.uploadId,
      })),
    ],
    [data.attachments, uploads]
  );

  const payload = useCallback(() => {
    const d = dataRef.current;
    const readyUploads = uploads
      .filter((u) => u.uploadId)
      .map((u) => ({ source: 'upload', id: u.uploadId }));
    const fromMessage = (d.attachments || [])
      .filter((a) => a.source === 'message')
      .map((a) => ({
        source: 'message',
        folder: a.folder,
        uid: a.uid,
        part: a.part,
        filename: a.filename,
      }));
    return {
      to: d.to,
      cc: d.cc,
      bcc: d.bcc,
      subject: d.subject,
      html: d.html,
      inReplyTo: d.inReplyTo || undefined,
      references: d.references || [],
      inReplyToRef: d.inReplyToRef || undefined,
      attachments: [...fromMessage, ...readyUploads],
      draftUid: d.draftUid || undefined,
      priority: d.priority || 'normal',
    };
  }, [uploads]);

  const isEmpty = () => {
    const d = dataRef.current;
    const text = (d.html || '').replace(/<[^>]+>/g, '').trim();
    return (
      !d.to.length &&
      !d.cc.length &&
      !d.bcc.length &&
      !d.subject.trim() &&
      !text &&
      attachments.length === 0
    );
  };

  // Debounced autosave.
  const saveDraft = useCallback(
    async ({ silent = true } = {}) => {
      if (loading || sending) return null;
      if (isEmpty()) return null;
      update(id, { saving: true });
      try {
        const result = await apiPost('/api/drafts', payload());
        update(id, {
          saving: false,
          savedAt: Date.now(),
          dirty: false,
          data: { ...dataRef.current, draftUid: result.uid },
        });
        queryClient.invalidateQueries({
          queryKey: ['messages'],
          predicate: (q) => q.queryKey[1]?.folder === result.folder,
        });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        if (!silent) toast.success('Draft saved');
        return result;
      } catch (error) {
        update(id, { saving: false });
        if (!silent) toast.error(error.message || 'Unable to save the draft.');
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, loading, sending, payload, update, queryClient, attachments.length]
  );

  useEffect(() => {
    if (!win.dirty || loading || uploading) return undefined;
    const timer = setTimeout(() => saveDraft({ silent: true }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [win.dirty, data, loading, uploading, saveDraft]);

  async function send() {
    const d = dataRef.current;
    if (!d.to.length && !d.cc.length && !d.bcc.length) {
      toast.error('Add at least one recipient.');
      return;
    }
    if (uploading) {
      toast.error('Please wait for attachments to finish uploading.');
      return;
    }
    if (uploads.some((u) => u.error)) {
      toast.error('Remove the attachments that failed to upload.');
      return;
    }
    if (!d.subject.trim() && !window.confirm('Send this message without a subject?')) return;
    setSending(true);
    try {
      await apiPost('/api/mail/send', payload());
      toast.success('Message sent');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      if (d.inReplyToRef)
        queryClient.invalidateQueries({ queryKey: ['thread', d.inReplyToRef.folder] });
      close(id);
    } catch (error) {
      toast.error(error.message || 'Unable to send message. Please try again.');
      setSending(false);
    }
  }

  async function discard() {
    const d = dataRef.current;
    close(id);
    if (d.draftUid) {
      try {
        await apiDelete('/api/drafts', { uid: d.draftUid });
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
      } catch {
        // ignore
      }
    }
    for (const u of uploads)
      if (u.uploadId) apiDelete('/api/attachments/upload', { id: u.uploadId }).catch(() => {});
    toast('Draft discarded');
  }

  function requestClose() {
    if (isEmpty()) {
      close(id);
      return;
    }
    saveDraft({ silent: false }).then(() => close(id));
  }

  function applySignature(sig) {
    const html = data.html || '';
    const stripped = html.replace(/<div class="wm-signature">[\s\S]*?<\/div>/, '');
    const next = sig
      ? insertBeforeQuote(stripped, `<div class="wm-signature"><br>-- <br>${sig.html}</div>`)
      : stripped;
    updateData(id, { html: next, signatureId: sig ? sig.id : null });
    setEditorKey((k) => k + 1);
  }

  // Keyboard: Cmd/Ctrl+Enter to send, Esc to minimise.
  function onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape' && !mobile) {
      e.stopPropagation();
      minimize(id);
    }
  }

  if (minimizedBar) {
    return (
      <div
        className="border-border bg-foreground text-background shadow-float pointer-events-auto flex h-10 w-64 items-center gap-2 rounded-t-xl border px-3 text-sm"
        role="group"
        aria-label={`Minimized: ${data.subject || title}`}
      >
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left font-medium"
          onClick={() => minimize(id, false)}
        >
          {data.subject || title}
        </button>
        <button
          type="button"
          aria-label="Restore"
          className="hover:bg-background/20 rounded p-1"
          onClick={() => minimize(id, false)}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Close"
          className="hover:bg-background/20 rounded p-1"
          onClick={requestClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const sizeClass = mobile
    ? 'inset-0 h-full w-full rounded-none'
    : expanded
      ? 'h-[min(88vh,56rem)] w-[min(92vw,64rem)] rounded-2xl'
      : 'h-[min(78vh,40rem)] w-[min(92vw,36rem)] rounded-t-2xl';

  return (
    <div
      ref={dropRef}
      role="dialog"
      aria-label={title}
      data-testid="compose-window"
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) addFiles([...e.dataTransfer.files]);
      }}
      className={cn(
        'border-border bg-popover text-popover-foreground shadow-float animate-slide-up pointer-events-auto relative flex flex-col overflow-hidden border',
        sizeClass,
        dragging && 'ring-primary ring-2'
      )}
    >
      <header className="bg-foreground/95 text-background flex h-11 shrink-0 items-center gap-1 px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{data.subject || title}</h2>
        {!mobile ? (
          <>
            <IconButton
              label="Minimize"
              size="icon-sm"
              className="text-background hover:bg-background/20 hover:text-background"
              onClick={() => minimize(id)}
              tooltip={false}
            >
              <Minus />
            </IconButton>
            <IconButton
              label={expanded ? 'Exit full screen' : 'Full screen'}
              size="icon-sm"
              className="text-background hover:bg-background/20 hover:text-background"
              onClick={() => expand(id)}
              tooltip={false}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </IconButton>
          </>
        ) : null}
        <IconButton
          label="Save and close"
          size="icon-sm"
          className="text-background hover:bg-background/20 hover:text-background"
          onClick={requestClose}
          tooltip={false}
          data-testid="compose-close"
        >
          <X />
        </IconButton>
      </header>

      {loading ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="border-border shrink-0 space-y-0 border-b px-3">
            <RecipientInput
              id={`${id}-to`}
              label="To"
              value={data.to}
              onChange={(to) => updateData(id, { to })}
              autoFocus={mode === 'new' && !data.to.length}
              trailing={
                <div className="text-muted-foreground flex gap-1 text-xs">
                  {!showCc ? (
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => update(id, { showCc: true })}
                    >
                      Cc
                    </button>
                  ) : null}
                  {!showBcc ? (
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => update(id, { showBcc: true })}
                    >
                      Bcc
                    </button>
                  ) : null}
                </div>
              }
            />
            {showCc ? (
              <RecipientInput
                id={`${id}-cc`}
                label="Cc"
                value={data.cc}
                onChange={(cc) => updateData(id, { cc })}
              />
            ) : null}
            {showBcc ? (
              <RecipientInput
                id={`${id}-bcc`}
                label="Bcc"
                value={data.bcc}
                onChange={(bcc) => updateData(id, { bcc })}
              />
            ) : null}
            <div className="border-border/60 flex items-center border-t">
              <label htmlFor={`${id}-subject`} className="sr-only">
                Subject
              </label>
              <Input
                id={`${id}-subject`}
                placeholder="Subject"
                value={data.subject}
                onChange={(e) => updateData(id, { subject: e.target.value })}
                className="h-10 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                data-testid="compose-subject"
                autoFocus={mode !== 'new' && !!data.to.length}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-3 py-2">
            <RichTextEditor
              key={editorKey}
              initialHtml={data.html}
              onChange={(html) => updateData(id, { html })}
              onFiles={addFiles}
              placeholder="Write your message…"
              autoFocus={mode !== 'new' && !!data.to.length && !!data.subject}
            />
            {attachments.length ? (
              <AttachmentPicker
                attachments={attachments}
                onRemove={(a) =>
                  a.source === 'upload'
                    ? removeUpload(a.id)
                    : updateData(id, (d) => ({
                        attachments: d.attachments.filter((x) => x.id !== a.id),
                      }))
                }
              />
            ) : null}
          </div>

          <footer className="border-border flex shrink-0 flex-wrap items-center gap-1 border-t px-3 py-2">
            <div className="flex items-center">
              <Button
                onClick={send}
                loading={sending}
                disabled={uploading}
                className="rounded-r-none pr-3"
                data-testid="compose-send"
              >
                <Send /> Send
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="More send options"
                    className="border-primary-foreground/30 rounded-l-none border-l px-2"
                  >
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Priority</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={data.priority || 'normal'}
                    onValueChange={(priority) => updateData(id, { priority })}
                  >
                    <DropdownMenuRadioItem value="high">High</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="normal">Normal</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="low">Low</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles([...e.target.files]);
                  e.target.value = '';
                }}
              />
              <span
                className="hover:bg-muted inline-flex h-9 w-9 items-center justify-center rounded-lg"
                title="Attach files"
                aria-label="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </span>
            </label>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  addFiles([...e.target.files]);
                  e.target.value = '';
                }}
              />
              <span
                className="hover:bg-muted inline-flex h-9 w-9 items-center justify-center rounded-lg"
                title="Attach image"
                aria-label="Attach image"
              >
                <ImageIcon className="h-4 w-4" />
              </span>
            </label>
            {signatures.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    Signature <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => applySignature(null)}>
                    No signature
                  </DropdownMenuItem>
                  {signatures.map((s) => (
                    <DropdownMenuItem key={s.id} onSelect={() => applySignature(s)}>
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <span className="text-muted-foreground ml-auto text-xs" aria-live="polite">
              {win.saving ? 'Saving…' : win.savedAt ? 'Draft saved' : ''}
            </span>
            <IconButton
              label="Discard draft"
              onClick={() => (isEmpty() ? close(id) : setConfirmDiscard(true))}
              data-testid="compose-discard"
            >
              <Trash2 />
            </IconButton>
          </footer>
        </>
      )}

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this message?</DialogTitle>
            <DialogDescription>The draft and its attachments will be deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false);
                discard();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function insertBeforeQuote(html, signature) {
  const idx = html.indexOf('<div class="gmail_quote">');
  if (idx === -1) return `${html}${signature}`;
  return `${html.slice(0, idx)}${signature}${html.slice(idx)}`;
}
