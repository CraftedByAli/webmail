'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';

/**
 * Icon-only control. `label` is mandatory: it becomes both the accessible name
 * and the tooltip, so an icon never ships without a text equivalent.
 */
export const IconButton = React.forwardRef(function IconButton(
  {
    label,
    shortcut,
    children,
    side = 'bottom',
    size = 'icon',
    variant = 'ghost',
    tooltip = true,
    ...props
  },
  ref
) {
  const button = (
    <Button ref={ref} variant={variant} size={size} aria-label={label} {...props}>
      {children}
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={side}>
        <span>{label}</span>
        {shortcut ? (
          <Kbd className="ml-1.5 border-white/25 bg-white/10 text-inherit">{shortcut}</Kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
});
