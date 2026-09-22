'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-black/45', className)}
      {...props}
    />
  );
});

export const DialogContent = React.forwardRef(function DialogContent(
  { className, children, hideClose = false, ...props },
  ref
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'overlay-in border-line bg-surface text-fg shadow-overlay rounded-surface fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 border p-5',
          className
        )}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className="text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-focus rounded-control absolute top-3 right-3 grid size-7 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ className, ...props }) {
  return <div className={cn('grid gap-1 pr-8 text-left', className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-title font-semibold', className)}
      {...props}
    />
  );
});

export const DialogDescription = React.forwardRef(function DialogDescription(
  { className, ...props },
  ref
) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-body text-fg-secondary', className)}
      {...props}
    />
  );
});
