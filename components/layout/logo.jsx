import { cn } from '@/utils/cn';

/**
 * Wordmark. Deliberately small and monochrome: in a tool people keep open all
 * day, the brand should be identifiable, not attention-seeking.
 */
export function Logo({ className, showText = true }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="bg-accent text-on-accent rounded-tight grid size-6 shrink-0 place-items-center"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        >
          <path d="M2 4.5h12v7H2z" />
          <path d="m2 5 6 4 6-4" strokeLinecap="round" />
        </svg>
      </span>
      {showText ? (
        <span className="text-body text-fg font-semibold tracking-tight">Webmail</span>
      ) : null}
    </span>
  );
}
