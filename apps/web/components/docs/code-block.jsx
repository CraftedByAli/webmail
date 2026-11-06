'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Preformatted snippet with a copy button. `title` names the file or shell the
 * snippet belongs to, so readers know where it goes before they read it.
 */
export function CodeBlock({ children, title, className }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/^\n+|\s+$/g, '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context); selecting still works.
    }
  }

  return (
    <div
      className={cn(
        'border-line bg-sunken rounded-surface group relative my-4 overflow-hidden border',
        className
      )}
    >
      {title ? (
        <div className="border-line text-caption text-fg-muted border-b px-3.5 py-1.5 font-mono">
          {title}
        </div>
      ) : null}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        className={cn(
          'text-fg-muted hover:bg-hover hover:text-fg rounded-control focus-visible:outline-focus bg-sunken absolute right-1.5 grid size-8 place-items-center transition-colors focus-visible:outline-2',
          title ? 'top-9' : 'top-1.5'
        )}
      >
        {copied ? <Check className="text-success size-4" /> : <Copy className="size-4" />}
      </button>
      <pre className="scrollbar-thin overflow-x-auto p-3.5 pr-11">
        <code className="text-caption text-fg font-mono leading-relaxed">{code}</code>
      </pre>
    </div>
  );
}
