'use client';

import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/cn';

/**
 * Label + control + help/error, wired together for screen readers.
 *
 * Every form control in the product goes through this so that labels are never
 * replaced by placeholders and errors are always announced next to their source.
 */
export function Field({ label, help, error, required, className, children, htmlFor }) {
  const generated = useId();
  const id = htmlFor || generated;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-danger ml-0.5" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {typeof children === 'function'
        ? children({
            id,
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : undefined,
          })
        : children}
      {help && !error ? (
        <p id={helpId} className="text-caption text-fg-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption text-danger flex items-start gap-1">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
