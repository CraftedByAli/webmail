'use client';

import * as React from 'react';
import { cn } from '@/utils/cn';
import { avatarColor, initialsOf } from '@/utils/format';

/** Initials avatar coloured deterministically by address. */
export function Avatar({ address, className, size = 'md' }) {
  const label = address?.name || address?.address || '';
  const sizes = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm' };
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none',
        sizes[size],
        className
      )}
      style={{ backgroundColor: avatarColor(address?.address) }}
    >
      {initialsOf(address)}
    </span>
  );
}
