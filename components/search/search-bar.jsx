'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/cn';

const OPERATORS = [
  ['from:', 'sender'],
  ['to:', 'recipient'],
  ['subject:', 'subject'],
  ['has:attachment', 'with files'],
  ['is:unread', 'unread only'],
  ['is:starred', 'starred only'],
  ['after:2024-01-01', 'after a date'],
  ['before:2024-12-31', 'before a date'],
  ['in:sent', 'in a folder'],
];

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const urlQuery = pathname.startsWith('/mail/search') ? params.get('q') || '' : '';
  const [value, setValue] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const [advanced, setAdvanced] = useState({
    from: '',
    to: '',
    subject: '',
    hasAttachment: false,
    unread: false,
  });
  const [open, setOpen] = useState(false);

  // Keep the box in sync when the URL changes (back/forward, sidebar clicks).
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  function submit(query) {
    const q = (query ?? value).trim();
    if (!q) {
      router.push('/mail/inbox');
      return;
    }
    router.push(`/mail/search?q=${encodeURIComponent(q)}`);
  }

  function submitAdvanced() {
    const parts = [];
    if (advanced.from) parts.push(`from:${quote(advanced.from)}`);
    if (advanced.to) parts.push(`to:${quote(advanced.to)}`);
    if (advanced.subject) parts.push(`subject:${quote(advanced.subject)}`);
    if (advanced.hasAttachment) parts.push('has:attachment');
    if (advanced.unread) parts.push('is:unread');
    if (value.trim()) parts.push(value.trim());
    setOpen(false);
    submit(parts.join(' '));
  }

  return (
    <form
      role="search"
      className="relative w-full max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input
        id="global-search"
        type="search"
        aria-label="Search mail"
        placeholder="Search mail"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={cn(
          'bg-muted focus-visible:bg-surface focus-visible:shadow-soft h-10 rounded-full border-transparent pr-20 pl-10 shadow-none',
          value && 'bg-surface'
        )}
        enterKeyHint="search"
      />
      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            onClick={() => submit('')}
          >
            <X />
          </Button>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Advanced search options"
            >
              <SlidersHorizontal />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,26rem)] space-y-3">
            <div className="grid gap-2">
              {[
                ['from', 'From'],
                ['to', 'To'],
                ['subject', 'Subject'],
              ].map(([key, label]) => (
                <div key={key} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
                  <Label htmlFor={`adv-${key}`} className="text-muted-foreground">
                    {label}
                  </Label>
                  <Input
                    id={`adv-${key}`}
                    className="h-9"
                    value={advanced[key]}
                    onChange={(e) => setAdvanced({ ...advanced, [key]: e.target.value })}
                  />
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={advanced.hasAttachment}
                  onChange={(e) => setAdvanced({ ...advanced, hasAttachment: e.target.checked })}
                />
                Has attachment
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={advanced.unread}
                  onChange={(e) => setAdvanced({ ...advanced, unread: e.target.checked })}
                />
                Unread only
              </label>
            </div>
            <div className="text-muted-foreground text-xs">
              <p className="text-foreground mb-1 font-medium">Operators</p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {OPERATORS.map(([op, desc]) => (
                  <li key={op}>
                    <button
                      type="button"
                      className="text-primary font-mono hover:underline"
                      onClick={() => setValue((v) => `${v} ${op}`.trim())}
                    >
                      {op}
                    </button>{' '}
                    <span>{desc}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setAdvanced({
                    from: '',
                    to: '',
                    subject: '',
                    hasAttachment: false,
                    unread: false,
                  })
                }
              >
                Reset
              </Button>
              <Button type="button" size="sm" onClick={submitAdvanced}>
                Search
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </form>
  );
}

function quote(v) {
  return /\s/.test(v) ? `"${v.replace(/"/g, '')}"` : v;
}
