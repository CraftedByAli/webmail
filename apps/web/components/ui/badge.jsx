import { cva } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * Badges carry status only. Counts use `count`; anything decorative should be
 * plain text instead.
 */
const badgeVariants = cva('inline-flex items-center gap-1 font-medium', {
  variants: {
    variant: {
      neutral: 'bg-hover text-fg-secondary',
      accent: 'bg-accent-subtle text-accent-text',
      success: 'bg-success-subtle text-success',
      warning: 'bg-warning-subtle text-warning',
      danger: 'bg-danger-subtle text-danger',
      outline: 'border border-line-strong text-fg-secondary',
    },
    size: {
      sm: 'h-4 rounded-tight px-1.5 text-meta',
      md: 'h-5 rounded-control px-2 text-caption',
      count: 'h-4 min-w-4 justify-center rounded-pill px-1 text-meta tabular-nums',
    },
  },
  defaultVariants: { variant: 'neutral', size: 'sm' },
});

export function Badge({ className, variant, size, ...props }) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
