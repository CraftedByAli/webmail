'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip, X, AlertCircle } from 'lucide-react';
import { formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';

const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_ATTACHMENT_SIZE_MB || 50);

/**
 * Upload state for a compose window. Uploads stream to /api/attachments/upload
 * via XHR so we can show progress; the returned id is referenced when sending.
 */
export function useAttachmentUploads(windowId) {
  const [uploads, setUploads] = useState([]);
  const xhrs = useRef(new Map());

  const addFiles = useCallback(
    (files) => {
      for (const file of files) {
        if (file.size > MAX_MB * 1024 * 1024) {
          toast.error(`${file.name} is larger than ${MAX_MB} MB.`);
          continue;
        }
        const id = `${windowId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        setUploads((list) => [
          ...list,
          {
            id,
            name: file.name,
            size: file.size,
            type: file.type,
            progress: 0,
            uploadId: null,
            error: null,
          },
        ]);

        const xhr = new XMLHttpRequest();
        xhrs.current.set(id, xhr);
        const form = new FormData();
        form.append('file', file, file.name);
        xhr.open('POST', '/api/attachments/upload');
        xhr.setRequestHeader('X-Requested-With', 'webmail');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setUploads((list) =>
              list.map((u) =>
                u.id === id ? { ...u, progress: Math.round((e.loaded / e.total) * 100) } : u
              )
            );
        };
        xhr.onload = () => {
          xhrs.current.delete(id);
          if (xhr.status >= 200 && xhr.status < 300) {
            const meta = JSON.parse(xhr.responseText);
            setUploads((list) =>
              list.map((u) =>
                u.id === id
                  ? {
                      ...u,
                      progress: 100,
                      uploadId: meta.id,
                      type: meta.contentType,
                      name: meta.filename,
                    }
                  : u
              )
            );
          } else {
            let message = 'Upload failed';
            try {
              message = JSON.parse(xhr.responseText).error?.message || message;
            } catch {
              // ignore
            }
            setUploads((list) => list.map((u) => (u.id === id ? { ...u, error: message } : u)));
            toast.error(`${file.name}: ${message}`);
          }
        };
        xhr.onerror = () => {
          xhrs.current.delete(id);
          setUploads((list) =>
            list.map((u) => (u.id === id ? { ...u, error: 'Upload failed' } : u))
          );
        };
        xhr.send(form);
      }
    },
    [windowId]
  );

  const removeUpload = useCallback((id) => {
    const xhr = xhrs.current.get(id);
    if (xhr) xhr.abort();
    setUploads((list) => {
      const target = list.find((u) => u.id === id);
      if (target?.uploadId) {
        fetch('/api/attachments/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'webmail' },
          body: JSON.stringify({ id: target.uploadId }),
        }).catch(() => {});
      }
      return list.filter((u) => u.id !== id);
    });
  }, []);

  const uploading = uploads.some((u) => !u.uploadId && !u.error);
  return { uploads, addFiles, removeUpload, uploading };
}

/** Renders the attachment chips inside the compose window. */
export function AttachmentPicker({ attachments, onRemove }) {
  return (
    <ul
      className="border-border/60 mt-3 flex flex-wrap gap-2 border-t pt-3"
      aria-label="Attachments"
    >
      {attachments.map((a) => (
        <li
          key={a.id}
          className={cn(
            'border-border bg-surface-raised relative flex max-w-xs items-center gap-2 overflow-hidden rounded-xl border px-3 py-1.5 text-xs',
            a.error && 'border-destructive/50'
          )}
        >
          {a.error ? (
            <AlertCircle className="text-destructive h-4 w-4 shrink-0" />
          ) : (
            <Paperclip className="text-muted-foreground h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium" title={a.filename}>
              {a.filename}
            </p>
            <p className="text-muted-foreground">
              {a.error
                ? a.error
                : a.progress !== undefined && a.progress < 100 && !a.uploadId
                  ? `Uploading ${a.progress}%`
                  : formatBytes(a.size)}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Remove ${a.filename}`}
            className="hover:bg-muted ml-1 rounded-full p-0.5"
            onClick={() => onRemove(a)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {a.progress !== undefined && a.progress < 100 && !a.uploadId && !a.error ? (
            <span
              className="bg-primary absolute inset-x-0 bottom-0 h-0.5 transition-all"
              style={{ width: `${a.progress}%` }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
