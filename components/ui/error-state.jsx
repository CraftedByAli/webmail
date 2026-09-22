'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Recoverable failure. Shows what failed and how to retry — never a stack
 * trace or an internal error code.
 */
export function ErrorState({ title = 'Something went wrong', message, onRetry, retrying = false }) {
  return (
    <div
      role="alert"
      className="flex min-h-52 flex-1 flex-col items-center justify-center px-6 py-14 text-center"
    >
      <p className="text-title text-fg font-semibold">{title}</p>
      <p className="measure text-body text-fg-secondary mt-1.5">{message || 'Please try again.'}</p>
      {onRetry ? (
        <Button variant="default" className="mt-4" onClick={onRetry} loading={retrying}>
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Inline failure used inside an already-rendered surface. */
export function InlineError({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="bg-danger-subtle text-ui text-danger rounded-control flex flex-wrap items-center gap-2 px-3 py-2"
    >
      <span>{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline underline-offset-2"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
