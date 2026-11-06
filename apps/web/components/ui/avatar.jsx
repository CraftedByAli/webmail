'use client';

import { cn } from '@/utils/cn';
import { initialsOf } from '@/utils/format';

/**
 * Neutral initials avatar.
 *
 * Deliberately monochrome: a per-sender colour hash turns a mail list into a
 * confetti of meaningless colour and competes with the accent, which in this
 * product means "unread / current / focus". Identity is carried by the name.
 */
const sizes = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-meta',
  md: 'size-7 text-meta',
  lg: 'size-9 text-caption',
};

export function Avatar({ address, className, size = 'md' }) {
  const label = address?.name || address?.address || '';
  return (
    <span
      role="img"
      aria-label={label || 'Unknown sender'}
      className={cn(
        'rounded-pill bg-hover text-fg-secondary ring-line inline-grid shrink-0 place-items-center font-semibold uppercase ring-1 select-none ring-inset',
        sizes[size],
        className
      )}
    >
      {initialsOf(address)}
    </span>
  );
}
