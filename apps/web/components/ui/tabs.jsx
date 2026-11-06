'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/utils/cn';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('border-line flex items-center gap-4 border-b', className)}
      {...props}
    />
  );
});

export const TabsTrigger = React.forwardRef(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'text-ui text-fg-secondary -mb-px border-b-2 border-transparent pt-1 pb-2 font-medium whitespace-nowrap transition-colors duration-100',
        'hover:text-fg focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        'data-[state=active]:border-accent data-[state=active]:text-fg',
        className
      )}
      {...props}
    />
  );
});

export const TabsContent = React.forwardRef(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content ref={ref} className={cn('mt-4 outline-none', className)} {...props} />
  );
});
