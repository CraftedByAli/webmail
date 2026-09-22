'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Icon-only button with a mandatory accessible label rendered as both an
 * aria-label and a tooltip.
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
        {label}
        {shortcut ? (
          <kbd className="border-border bg-muted text-muted-foreground ml-2 rounded border px-1 font-mono text-[10px]">
            {shortcut}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
});
