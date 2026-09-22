'use client';

import { useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  File,
  FileArchive,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';

const PREVIEWABLE = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|text\/plain)$/i;

function iconFor(type = '') {
  if (type.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf' || type.startsWith('text/')) return FileText;
  if (/zip|compressed|tar|gzip|7z|rar/.test(type)) return FileArchive;
  if (/spreadsheet|excel|csv/.test(type)) return FileSpreadsheet;
  return File;
}

/**
 * Attachments read as a list of files, not a row of decorative tiles. The whole
 * row is the download target; preview is a secondary action where it is safe.
 */
export function AttachmentList({ attachments }) {
  const [preview, setPreview] = useState(null);

  return (
    <section className="border-line mt-5 border-t pt-3 print:hidden" aria-label="Attachments">
      <h3 className="text-meta text-fg-muted mb-2 font-semibold tracking-wide uppercase">
        {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
      </h3>
      <ul className="grid max-w-md gap-0.5">
        {attachments.map((a) => {
          const Icon = iconFor(a.contentType);
          const canPreview = PREVIEWABLE.test(a.contentType) && a.size < 25 * 1024 * 1024;
          return (
            <li key={a.part}>
              <div className="group hover:bg-hover rounded-control flex items-center gap-2.5 py-1.5 pr-1 pl-1.5 transition-colors duration-100">
                <Icon className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
                <a
                  href={`${a.url}&download=1`}
                  download={a.filename}
                  className="focus-visible:outline-focus flex min-w-0 flex-1 items-baseline gap-2 focus-visible:outline-2 focus-visible:outline-offset-2"
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
                </a>
                <div className="flex shrink-0 items-center gap-0.5">
                  {canPreview ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => setPreview(a)}
                    >
                      Preview
                      <span className="sr-only"> {a.filename}</span>
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="icon-xs" asChild>
                    <a
                      href={`${a.url}&download=1`}
                      download={a.filename}
                      aria-label={`Download ${a.filename}`}
                    >
                      <Download />
                    </a>
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="flex h-[86vh] max-w-4xl flex-col gap-3 p-3" hideClose>
          {preview ? (
            <>
              <div className="flex items-center justify-between gap-2 pl-1">
                <DialogTitle className="text-ui truncate font-medium">
                  {preview.filename}
                </DialogTitle>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="default" size="sm" asChild>
                    <a href={`${preview.url}&download=1`} download={preview.filename}>
                      <Download /> Download
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close preview"
                    onClick={() => setPreview(null)}
                  >
                    <X />
                  </Button>
                </div>
              </div>
              <AttachmentPreview attachment={preview} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AttachmentPreview({ attachment }) {
  const [failed, setFailed] = useState(false);
  const url = `${attachment.url}&download=0`;

  if (failed) {
    return (
      <div className="text-body text-fg-secondary flex flex-1 flex-col items-center justify-center gap-3">
        <p>This file cannot be previewed in the browser.</p>
        <Button variant="primary" asChild>
          <a href={`${attachment.url}&download=1`} download={attachment.filename}>
            <Download /> Download instead
          </a>
        </Button>
      </div>
    );
  }

  if (attachment.contentType.startsWith('image/')) {
    return (
      <div className="bg-sunken rounded-control grid min-h-0 flex-1 place-items-center overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.filename}
          className="max-h-full max-w-full object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  // Only inline-safe types (PDF, plain text) are ever served inline by the
  // server; everything else is forced to download.
  return (
    <iframe
      title={attachment.filename}
      src={url}
      className={cn('border-line rounded-control min-h-0 w-full flex-1 border bg-white')}
      onError={() => setFailed(true)}
    />
  );
}
