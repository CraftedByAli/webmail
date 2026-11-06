import { cn } from '@/utils/cn';

/**
 * Empty states are quiet by design: a short statement of fact, an optional
 * explanation, and at most one action. No illustration, no framed icon tile —
 * an empty inbox is good news, not an event.
 */
export function EmptyState({ title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex min-h-52 flex-1 flex-col items-center justify-center px-6 py-14 text-center',
        className
      )}
    >
      <p className="text-title text-fg font-semibold">{title}</p>
      {description ? (
        <p className="measure text-body text-fg-secondary mt-1.5">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
