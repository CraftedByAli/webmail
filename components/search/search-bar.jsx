'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/utils/cn';

const OPERATORS = [
  ['from:', 'sender'],
  ['to:', 'recipient'],
  ['subject:', 'subject'],
  ['has:attachment', 'with files'],
  ['is:unread', 'unread only'],
  ['is:starred', 'starred only'],
  ['after:2024-01-01', 'after a date'],
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
      className="relative w-full max-w-[32rem]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Search
        className="text-fg-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input
        id="global-search"
        type="search"
        aria-label="Search mail"
        placeholder="Search mail"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        enterKeyHint="search"
        className={cn(
          'bg-hover h-8 border-transparent pr-16 pl-8 [&::-webkit-search-cancel-button]:hidden',
          'focus-visible:border-accent focus-visible:bg-surface'
        )}
      />
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Clear search"
            onClick={() => submit('')}
          >
            <X />
          </Button>
        ) : (
          <Kbd className="mr-0.5 hidden sm:inline-flex">/</Kbd>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Search options">
              <SlidersHorizontal />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,24rem)] p-4">
            <div className="grid gap-3">
              <Field label="From" htmlFor="adv-from">
                <Input
                  id="adv-from"
                  value={advanced.from}
                  onChange={(e) => setAdvanced({ ...advanced, from: e.target.value })}
                />
              </Field>
              <Field label="To" htmlFor="adv-to">
                <Input
                  id="adv-to"
                  value={advanced.to}
                  onChange={(e) => setAdvanced({ ...advanced, to: e.target.value })}
                />
              </Field>
              <Field label="Subject" htmlFor="adv-subject">
                <Input
                  id="adv-subject"
                  value={advanced.subject}
                  onChange={(e) => setAdvanced({ ...advanced, subject: e.target.value })}
                />
              </Field>
              <div className="grid gap-2 pt-0.5">
                <label className="text-ui text-fg flex items-center gap-2">
                  <Checkbox
                    checked={advanced.hasAttachment}
                    onCheckedChange={(v) => setAdvanced({ ...advanced, hasAttachment: v === true })}
                  />
                  Has attachment
                </label>
                <label className="text-ui text-fg flex items-center gap-2">
                  <Checkbox
                    checked={advanced.unread}
                    onCheckedChange={(v) => setAdvanced({ ...advanced, unread: v === true })}
                  />
                  Unread only
                </label>
              </div>
            </div>

            <div className="border-line mt-4 border-t pt-3">
              <p className="text-meta text-fg-muted mb-1.5 font-semibold tracking-wide uppercase">
                Operators
              </p>
              <ul className="text-caption text-fg-secondary grid grid-cols-2 gap-x-3 gap-y-1">
                {OPERATORS.map(([op, desc]) => (
                  <li key={op} className="truncate">
                    <button
                      type="button"
                      className="text-accent-text font-mono hover:underline"
                      onClick={() => setValue((v) => `${v} ${op}`.trim())}
                    >
                      {op}
                    </button>{' '}
                    <span>{desc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex justify-end gap-2">
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
              <Button type="button" variant="primary" size="sm" onClick={submitAdvanced}>
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
