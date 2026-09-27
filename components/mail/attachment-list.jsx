'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Mail,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { formatBytes } from '@/utils/format';
import {
  MAX_TEXT_PREVIEW_BYTES,
  downloadAttachment,
  effectiveType,
  extensionOf,
  fetchAttachmentBlob,
  inlineUrl,
  parseDelimited,
  previewKind,
} from '@/utils/attachments';
import { cn } from '@/utils/cn';

function iconFor(attachment) {
  const type = effectiveType(attachment);
  const ext = extensionOf(attachment.filename);
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('audio/')) return FileAudio;
  if (type.startsWith('video/')) return FileVideo;
  if (type === 'message/rfc822') return Mail;
  if (/zip|compressed|tar|gzip|7z|rar/.test(type) || /^(zip|rar|7z|gz|tgz|tar)$/.test(ext))
    return FileArchive;
  if (/spreadsheet|excel|csv/.test(type) || /^(xlsx?|ods|csv|tsv)$/.test(ext))
    return FileSpreadsheet;
  if (/json|xml|javascript/.test(type) || /^(json|xml|js|ts|py|sh|sql|html?)$/.test(ext))
    return FileCode;
  if (type === 'application/pdf' || type.startsWith('text/') || /word|document/.test(type))
    return FileText;
  return File;
}

/** Tracks per-attachment download state so every button can show progress. */
function useDownloads() {
  const [busy, setBusy] = useState(() => new Set());
  const download = useCallback(async (attachment) => {
    setBusy((s) => new Set(s).add(attachment.part));
    try {
      await downloadAttachment(attachment);
    } catch (error) {
      toast.error(`Couldn't download ${attachment.filename}`, { description: error.message });
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(attachment.part);
        return next;
      });
    }
  }, []);
  return { busy, download };
}

/**
 * Attachments read as a list of files, not a row of decorative tiles. The
 * name opens a preview where the browser can render the file safely and
 * downloads otherwise; the download button always saves the file.
 */
export function AttachmentList({ attachments }) {
  const [previewIndex, setPreviewIndex] = useState(null);
  const { busy, download } = useDownloads();
  const previewable = attachments.filter((a) => previewKind(a));
  const current = previewIndex === null ? null : previewable[previewIndex] || null;
  const totalSize = attachments.reduce((n, a) => n + (a.size || 0), 0);

  async function downloadAll() {
    for (const a of attachments) {
      await download(a);
    }
  }

  function open(attachment) {
    const index = previewable.indexOf(attachment);
    if (index === -1) download(attachment);
    else setPreviewIndex(index);
  }

  return (
    <section className="border-line mt-5 border-t pt-3 print:hidden" aria-label="Attachments">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-meta text-fg-muted font-semibold tracking-wide uppercase">
          {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
          <span className="font-normal normal-case" data-numeric>
            {' '}
            · {formatBytes(totalSize)}
          </span>
        </h3>
        {attachments.length > 1 ? (
          <Button variant="ghost" size="xs" onClick={downloadAll} disabled={busy.size > 0}>
            <Download /> Download all
          </Button>
        ) : null}
      </div>
      <ul className="grid max-w-lg gap-0.5">
        {attachments.map((a) => {
          const Icon = iconFor(a);
          const canPreview = !!previewKind(a);
          const isBusy = busy.has(a.part);
          return (
            <li key={a.part}>
              <div className="group hover:bg-hover rounded-control flex items-center gap-2.5 py-1.5 pr-1 pl-1.5 transition-colors duration-100">
                <Icon className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => open(a)}
                  className="focus-visible:outline-focus flex min-w-0 flex-1 items-baseline gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-label={canPreview ? `Preview ${a.filename}` : `Download ${a.filename}`}
                >
                  <span
                    className="text-ui text-fg truncate group-hover:underline"
                    title={a.filename}
                  >
                    {a.filename}
                  </span>
                  <span className="text-meta text-fg-muted shrink-0" data-numeric>
                    {formatBytes(a.size)}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  {canPreview ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      onClick={() => open(a)}
                      aria-label={`Preview ${a.filename}`}
                      title="Preview"
                    >
                      <Eye />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => download(a)}
                    disabled={isBusy}
                    aria-label={`Download ${a.filename}`}
                    title="Download"
                  >
                    {isBusy ? <Loader2 className="animate-spin" /> : <Download />}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!current} onOpenChange={(o) => !o && setPreviewIndex(null)}>
        <DialogContent
          className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-3 p-3"
          hideClose
          onKeyDown={(e) => {
            if (previewable.length < 2) return;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              setPreviewIndex((i) => (i + 1) % previewable.length);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setPreviewIndex((i) => (i - 1 + previewable.length) % previewable.length);
            }
          }}
        >
          {current ? (
            <>
              <div className="flex items-center justify-between gap-2 pl-1">
                <div className="min-w-0">
                  <DialogTitle className="text-ui truncate font-medium">
                    {current.filename}
                  </DialogTitle>
                  <DialogDescription className="text-meta text-fg-muted">
                    {formatBytes(current.size)}
                    {previewable.length > 1
                      ? ` · ${previewIndex + 1} of ${previewable.length}`
                      : ''}
                  </DialogDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {previewable.length > 1 ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Previous attachment"
                        onClick={() =>
                          setPreviewIndex((i) => (i - 1 + previewable.length) % previewable.length)
                        }
                      >
                        <ChevronLeft />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Next attachment"
                        onClick={() => setPreviewIndex((i) => (i + 1) % previewable.length)}
                      >
                        <ChevronRight />
                      </Button>
                    </>
                  ) : null}
                  {previewKind(current) === 'pdf' ? (
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a
                        href={inlineUrl(current)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open in new tab"
                        title="Open in new tab"
                      >
                        <ExternalLink />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => download(current)}
                    loading={busy.has(current.part)}
                  >
                    {busy.has(current.part) ? null : <Download />}
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close preview"
                    onClick={() => setPreviewIndex(null)}
                  >
                    <X />
                  </Button>
                </div>
              </div>
              <AttachmentPreview
                key={`${current.url}`}
                attachment={current}
                onDownload={() => download(current)}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PreviewFallback({ message, onDownload }) {
  return (
    <div className="text-body text-fg-secondary flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p>{message}</p>
      <Button variant="primary" onClick={onDownload}>
        <Download /> Download instead
      </Button>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="text-fg-muted flex flex-1 items-center justify-center gap-2" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span className="text-ui">Loading preview…</span>
    </div>
  );
}

function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * Loads the attachment through fetch so failures are reported instead of
 * rendering a broken frame, then renders it with the narrowest element that
 * can display it. Nothing here executes content from the file: images go
 * through <img>, text through a <pre>, PDFs through the browser's viewer.
 */
function AttachmentPreview({ attachment, onDownload }) {
  const kind = previewKind(attachment);
  // Media and PDFs stream straight from the endpoint (seekable, no copy in
  // memory); the browser reports failures on the element itself.
  const streamed = kind === 'audio' || kind === 'video' || kind === 'pdf';
  const [loaded, setState] = useState({ status: 'loading' });
  const [mediaError, setMediaError] = useState(null);
  const state = mediaError
    ? { status: 'error', message: mediaError }
    : streamed
      ? { status: 'ready', src: inlineUrl(attachment) }
      : loaded;

  useEffect(() => {
    if (streamed) return undefined;
    const controller = new AbortController();
    let objectUrl = null;
    (async () => {
      try {
        const blob = await fetchAttachmentBlob(attachment, { signal: controller.signal });
        if (kind === 'image') {
          objectUrl = URL.createObjectURL(blob);
          setState({ status: 'ready', src: objectUrl });
          return;
        }
        const truncated = blob.size > MAX_TEXT_PREVIEW_BYTES;
        const text = decodeText(await blob.slice(0, MAX_TEXT_PREVIEW_BYTES).arrayBuffer());
        setState({ status: 'ready', text, truncated });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        setState({ status: 'error', message: error.message });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, kind, streamed]);

  if (state.status === 'loading') return <PreviewLoading />;
  if (state.status === 'error')
    return <PreviewFallback message={state.message} onDownload={onDownload} />;

  const fail = () =>
    setMediaError(
      'This file could not be displayed. It may be damaged or in an unsupported format.'
    );

  if (kind === 'image') {
    return (
      <div className="bg-sunken rounded-control grid min-h-0 flex-1 place-items-center overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.src}
          alt={attachment.filename}
          className="max-h-full max-w-full object-contain"
          onError={fail}
        />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="bg-sunken rounded-control flex flex-1 items-center justify-center p-6">
        <audio
          src={state.src}
          controls
          preload="metadata"
          className="w-full max-w-lg"
          onError={fail}
        >
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div className="rounded-control flex min-h-0 flex-1 items-center justify-center bg-black">
        <video
          src={state.src}
          controls
          preload="metadata"
          playsInline
          className="max-h-full max-w-full"
          onError={fail}
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }

  if (kind === 'pdf') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <iframe
          title={attachment.filename}
          src={state.src}
          className="border-line rounded-control min-h-0 w-full flex-1 border bg-white"
        />
        {/* Mobile browsers cannot render PDFs inside a frame. */}
        <p className="text-meta text-fg-muted text-center sm:hidden">
          Preview not showing?{' '}
          <a
            className="text-accent-text underline"
            href={state.src}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the PDF
          </a>
        </p>
      </div>
    );
  }

  const Truncated = state.truncated ? (
    <p className="text-meta text-fg-muted border-line border-t px-3 py-2">
      Showing the first {formatBytes(MAX_TEXT_PREVIEW_BYTES)}. Download the file to see all of it.
    </p>
  ) : null;

  if (kind === 'csv') {
    const delimiter =
      extensionOf(attachment.filename) === 'tsv' ||
      effectiveType(attachment) === 'text/tab-separated-values'
        ? '\t'
        : state.text.split('\n', 1)[0].split(';').length >
            state.text.split('\n', 1)[0].split(',').length
          ? ';'
          : ',';
    const { rows, truncated } = parseDelimited(state.text, delimiter);
    const [head = [], ...body] = rows;
    return (
      <div className="border-line rounded-control flex min-h-0 flex-1 flex-col overflow-hidden border">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="text-ui w-max min-w-full border-collapse">
            <thead className="bg-sunken sticky top-0">
              <tr>
                {head.map((cell, i) => (
                  <th key={i} className="border-line border-b px-3 py-1.5 text-left font-semibold">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="even:bg-sunken/50">
                  {row.map((cell, c) => (
                    <td key={c} className="border-line border-b px-3 py-1 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {truncated ? (
          <p className="text-meta text-fg-muted border-line border-t px-3 py-2">
            Showing the first {rows.length} rows.
          </p>
        ) : (
          Truncated
        )}
      </div>
    );
  }

  return (
    <div className="border-line rounded-control flex min-h-0 flex-1 flex-col overflow-hidden border">
      <pre
        className={cn(
          'bg-surface text-fg min-h-0 flex-1 overflow-auto p-3 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap'
        )}
      >
        {state.text}
      </pre>
      {Truncated}
    </div>
  );
}
