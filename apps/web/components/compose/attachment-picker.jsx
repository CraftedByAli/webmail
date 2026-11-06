'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip, X, AlertCircle } from 'lucide-react';
import { formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';
import { useSession } from '@/hooks/use-session';

/** Used until the session (which carries the server's real limit) has loaded. */
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Upload state for one compose window. Files stream to the server over XHR so
 * progress is real rather than a spinner that guesses.
 */
export function useAttachmentUploads(windowId) {
  const [uploads, setUploads] = useState([]);
  const xhrs = useRef(new Map());
  // The server's MAX_ATTACHMENT_SIZE_MB, read at runtime so prebuilt images honour it.
  const { data: session } = useSession();
  const maxBytes = session?.limits?.maxAttachmentBytes || DEFAULT_MAX_BYTES;

  const addFiles = useCallback(
    (files) => {
      for (const file of files) {
        if (file.size > maxBytes) {
          toast.error(`${file.name} is larger than the ${formatBytes(maxBytes)} limit.`);
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
          if (e.lengthComputable) {
            setUploads((list) =>
              list.map((u) =>
                u.id === id ? { ...u, progress: Math.round((e.loaded / e.total) * 100) } : u
              )
            );
          }
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
              // Keep the generic message.
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
    [windowId, maxBytes]
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

/** Attached files, listed with live progress. */
export function AttachmentPicker({ attachments, onRemove }) {
  return (
    <ul className="border-line mt-4 grid gap-1 border-t pt-3" aria-label="Attached files">
      {attachments.map((a) => {
        const pending = a.progress !== undefined && a.progress < 100 && !a.uploadId && !a.error;
        return (
          <li
            key={a.id}
            className={cn(
              'rounded-control relative flex items-center gap-2 overflow-hidden px-2 py-1.5',
              a.error ? 'bg-danger-subtle' : 'bg-sunken'
            )}
          >
            {a.error ? (
              <AlertCircle className="text-danger size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Paperclip className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="text-ui text-fg block truncate" title={a.filename}>
                {a.filename}
              </span>
              <span className={cn('text-meta block', a.error ? 'text-danger' : 'text-fg-muted')}>
                {a.error ? a.error : pending ? `Uploading ${a.progress}%` : formatBytes(a.size)}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${a.filename}`}
              className="text-fg-muted hover:bg-active hover:text-fg focus-visible:outline-focus rounded-control grid size-6 shrink-0 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
              onClick={() => onRemove(a)}
            >
              <X className="size-3.5" />
            </button>
            {pending ? (
              <span
                className="bg-accent absolute inset-x-0 bottom-0 h-0.5 transition-[width] duration-200"
                style={{ width: `${a.progress}%` }}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
