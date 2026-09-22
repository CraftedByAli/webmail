'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/** User-facing error with a retry action. Never shows technical details. */
export function ErrorState({ title = 'Something went wrong', message, onRetry, retrying = false }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={message || 'Please try again.'}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry} loading={retrying}>
            <RefreshCw /> Try again
          </Button>
        ) : null
      }
    />
  );
}
