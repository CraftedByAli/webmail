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
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
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
import { useApi } from '@/hooks/use-account';
import { cn } from '@/utils/cn';

const AUTOSAVE_DELAY_MS = 3000;

/**
 * A compose window: docked bottom-right on desktop, full screen on mobile.
 *
 * The chrome is deliberately plain — a title, window controls, labelled address
 * rows and one primary Send. Writing is the content; the window should not
 * compete with it.
 */
export function ComposeWindow({ win, mobile = false, minimizedBar = false, showFrom = false }) {
  const api = useApi();
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
  const [dragging, setDragging] = useState(false);
  const dataRef = useRef(data);
  const { uploads, addFiles, removeUpload, uploading } = useAttachmentUploads(id);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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

  const saveDraft = useCallback(
    async ({ silent = true } = {}) => {
      if (loading || sending || isEmpty()) return null;
      update(id, { saving: true });
      try {
        const result = await api.post('/api/drafts', payload());
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
        if (!silent) toast.error(error.message || 'The draft could not be saved.');
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, id, loading, sending, payload, update, queryClient, attachments.length]
  );

  useEffect(() => {
    if (!win.dirty || loading || uploading) return undefined;
    const timer = setTimeout(() => saveDraft({ silent: true }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [win.dirty, data, loading, uploading, saveDraft]);

  async function send() {
    const d = dataRef.current;
    if (!d.to.length && !d.cc.length && !d.bcc.length) {
      toast.error('Add at least one recipient before sending.');
      return;
    }
    if (uploading) {
      toast.error('Wait for the attachments to finish uploading.');
      return;
    }
    if (uploads.some((u) => u.error)) {
      toast.error('Remove the attachments that failed to upload.');
      return;
    }
    if (!d.subject.trim() && !window.confirm('Send this message without a subject?')) return;
    setSending(true);
    try {
      await api.post('/api/mail/send', payload());
      toast.success('Message sent');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      if (d.inReplyToRef)
        queryClient.invalidateQueries({ queryKey: ['thread', d.inReplyToRef.folder] });
      close(id);
    } catch (error) {
      toast.error(error.message || 'The message could not be sent. Please try again.');
      setSending(false);
    }
  }

  async function discard() {
    const d = dataRef.current;
    close(id);
    if (d.draftUid) {
      try {
        await api.delete('/api/drafts', { uid: d.draftUid });
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
      } catch {
        // The window is already closed; a stale draft is harmless.
      }
    }
    for (const u of uploads) {
      if (u.uploadId) api.delete('/api/attachments/upload', { id: u.uploadId }).catch(() => {});
    }
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
        className="border-line bg-surface shadow-overlay rounded-t-surface pointer-events-auto flex h-9 w-60 items-center gap-0.5 border border-b-0 pr-1 pl-3"
        role="group"
        aria-label={`Minimised message: ${data.subject || title}`}
      >
        <button
          type="button"
          className="text-ui text-fg min-w-0 flex-1 truncate text-left font-medium"
          onClick={() => minimize(id, false)}
          title={win.account ? `From ${win.account}` : undefined}
        >
          {data.subject || title}
        </button>
        <IconButton
          label="Restore message"
          size="icon-xs"
          tooltip={false}
          onClick={() => minimize(id, false)}
        >
          <Maximize2 />
        </IconButton>
        <IconButton label="Save and close" size="icon-xs" tooltip={false} onClick={requestClose}>
          <X />
        </IconButton>
      </div>
    );
  }

  const sizeClass = mobile
    ? 'inset-0 h-full w-full rounded-none border-0'
    : expanded
      ? 'h-[min(88vh,54rem)] w-[min(92vw,60rem)] rounded-surface'
      : 'h-[min(80vh,38rem)] w-[min(92vw,34rem)] rounded-t-surface border-b-0';

  return (
    <div
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
        'border-line bg-surface text-fg shadow-overlay pointer-events-auto relative flex flex-col overflow-hidden border',
        sizeClass,
        dragging && 'ring-accent ring-2 ring-inset'
      )}
    >
      <header className="border-line bg-canvas flex h-10 shrink-0 items-center gap-0.5 border-b pr-1 pl-3">
        <h2 className="text-ui text-fg min-w-0 flex-1 truncate font-medium">
          {data.subject || title}
          {showFrom && win.account ? (
            <span className="text-fg-muted font-normal"> · {win.account}</span>
          ) : null}
        </h2>
        {!mobile ? (
          <>
            <IconButton
              label="Minimise"
              size="icon-sm"
              tooltip={false}
              onClick={() => minimize(id)}
            >
              <Minus />
            </IconButton>
            <IconButton
              label={expanded ? 'Exit full screen' : 'Full screen'}
              size="icon-sm"
              tooltip={false}
              onClick={() => expand(id)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </IconButton>
          </>
        ) : null}
        <IconButton
          label="Save and close"
          size="icon-sm"
          tooltip={false}
          onClick={requestClose}
          data-testid="compose-close"
        >
          <X />
        </IconButton>
      </header>

      {loading ? (
        <div className="text-ui text-fg-muted flex flex-1 items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading message…
        </div>
      ) : (
        <>
          <div className="border-line shrink-0 border-b px-3">
            {showFrom && win.account ? (
              <div
                className="border-line text-ui flex h-9 items-center gap-2 border-b"
                data-testid="compose-from"
              >
                <span className="text-fg-muted w-10 shrink-0">From</span>
                <span className="text-fg truncate font-medium">{win.account}</span>
              </div>
            ) : null}
            <RecipientInput
              id={`${id}-to`}
              label="To"
              value={data.to}
              onChange={(to) => updateData(id, { to })}
              autoFocus={mode === 'new' && !data.to.length}
              trailing={
                <div className="text-caption text-fg-muted flex gap-1.5">
                  {!showCc ? (
                    <button
                      type="button"
                      className="hover:text-fg focus-visible:outline-focus rounded-tight px-0.5 focus-visible:outline-2 focus-visible:outline-offset-1"
                      onClick={() => update(id, { showCc: true })}
                    >
                      Cc
                    </button>
                  ) : null}
                  {!showBcc ? (
                    <button
                      type="button"
                      className="hover:text-fg focus-visible:outline-focus rounded-tight px-0.5 focus-visible:outline-2 focus-visible:outline-offset-1"
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
            <div className="border-line flex items-center gap-2 border-t">
              <label htmlFor={`${id}-subject`} className="text-ui text-fg-muted w-12 shrink-0">
                Subject
              </label>
              <input
                id={`${id}-subject`}
                value={data.subject}
                onChange={(e) => updateData(id, { subject: e.target.value })}
                className="text-ui text-fg placeholder:text-fg-muted h-9 min-w-0 flex-1 bg-transparent outline-none"
                data-testid="compose-subject"
                autoFocus={mode !== 'new' && !!data.to.length}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-3 py-3">
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

          <footer className="border-line flex shrink-0 items-center gap-1 border-t px-3 py-2">
            <div className="flex items-center">
              <Button
                variant="primary"
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
                    variant="primary"
                    aria-label="Send options"
                    className="border-on-accent/25 rounded-l-none border-l px-1.5"
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

            <label className="ml-1 cursor-pointer">
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
                className="text-fg-secondary hover:bg-hover hover:text-fg rounded-control grid size-8 place-items-center transition-colors"
                title="Attach files"
                aria-label="Attach files"
                role="button"
                tabIndex={0}
              >
                <Paperclip className="size-4" />
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
                className="text-fg-secondary hover:bg-hover hover:text-fg rounded-control grid size-8 place-items-center transition-colors"
                title="Attach image"
                aria-label="Attach image"
                role="button"
                tabIndex={0}
              >
                <ImageIcon className="size-4" />
              </span>
            </label>

            {signatures.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
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

            <span
              className="text-caption text-fg-muted ml-auto flex items-center gap-1 pr-1"
              aria-live="polite"
            >
              {win.saving ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Saving
                </>
              ) : win.savedAt ? (
                <>
                  <Check className="size-3" /> Draft saved
                </>
              ) : null}
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
            <DialogDescription>
              The draft and any attachments you added will be deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
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
