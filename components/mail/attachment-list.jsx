'use client';

import { useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  File,
  FileArchive,
  FileSpreadsheet,
  Eye,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatBytes } from '@/utils/format';

const PREVIEWABLE = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|text\/plain)$/i;

function iconFor(type = '') {
  if (type.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf' || type.startsWith('text/')) return FileText;
  if (/zip|compressed|tar|gzip|7z|rar/.test(type)) return FileArchive;
  if (/spreadsheet|excel|csv/.test(type)) return FileSpreadsheet;
  return File;
}

export function AttachmentList({ attachments }) {
  const [preview, setPreview] = useState(null);
  return (
    <section className="border-border/70 mt-4 border-t pt-3 print:hidden" aria-label="Attachments">
      <h3 className="text-muted-foreground mb-2 text-xs font-medium">
        {attachments.length} attachment{attachments.length > 1 ? 's' : ''}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {attachments.map((a) => {
          const Icon = iconFor(a.contentType);
          const canPreview = PREVIEWABLE.test(a.contentType) && a.size < 25 * 1024 * 1024;
          const downloadUrl = `${a.url}&download=1`;
          return (
            <li
              key={a.part}
              className="border-border bg-surface-raised flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-sm"
            >
              <Icon className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate font-medium" title={a.filename}>
                  {a.filename}
                </p>
                <p className="text-muted-foreground text-xs">{formatBytes(a.size)}</p>
              </div>
              <div className="ml-1 flex shrink-0 items-center">
                {canPreview ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Preview ${a.filename}`}
                    onClick={() => setPreview(a)}
                  >
                    <Eye />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon-sm" asChild>
                  <a href={downloadUrl} download={a.filename} aria-label={`Download ${a.filename}`}>
                    <Download />
                  </a>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="h-[85vh] max-w-4xl gap-2 p-3" hideClose>
          {preview ? (
            <>
              <div className="flex items-center justify-between gap-2 px-1">
                <DialogTitle className="truncate text-sm">{preview.filename}</DialogTitle>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" asChild>
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
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-sm">
        Preview unavailable.
        <Button asChild>
          <a href={`${attachment.url}&download=1`} download={attachment.filename}>
            <Download /> Download instead
          </a>
        </Button>
      </div>
    );
  }
  if (attachment.contentType.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={attachment.filename}
        className="mx-auto max-h-full max-w-full object-contain"
        onError={() => setFailed(true)}
      />
    );
  }
  // Only inline-safe types (PDF, text) are ever served with an inline
  // disposition by the server; everything else is forced to download.
  return (
    <iframe
      title={attachment.filename}
      src={url}
      className="border-border h-full w-full flex-1 rounded-lg border bg-white"
      onError={() => setFailed(true)}
    />
  );
}
