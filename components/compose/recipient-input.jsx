'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiGet } from '@/utils/api-client';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/utils/cn';

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

function parseTyped(text) {
  const out = [];
  for (const part of text.split(/[,;]+/)) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
    const address = (m ? m[2] : t).trim().toLowerCase();
    out.push({ name: m ? m[1].trim() : '', address, invalid: !EMAIL_RE.test(address) });
  }
  return out;
}

/**
 * Recipient chips with autocomplete backed by /api/contacts/suggest.
 * Keyboard: Enter/Tab/comma to commit, Backspace to remove the last chip,
 * arrows to move through suggestions.
 */
export function RecipientInput({ id, label, value, onChange, autoFocus, trailing }) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const inputRef = useRef(null);

  useEffect(() => {
    const q = text.trim();
    const timer = setTimeout(async () => {
      if (q.length < 1) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await apiGet('/api/contacts/suggest', { q });
        const existing = new Set(value.map((v) => v.address));
        setSuggestions((res.suggestions || []).filter((s) => !existing.has(s.address)));
        setActive(0);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [text, value]);

  function commit(items) {
    const existing = new Set(value.map((v) => v.address));
    const additions = items.filter((i) => i.address && !existing.has(i.address));
    if (additions.length) onChange([...value, ...additions]);
    setText('');
    setSuggestions([]);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ';') {
      if (!text.trim() && e.key !== 'Tab') return;
      if (text.trim()) {
        e.preventDefault();
        if (open && suggestions[active] && e.key !== ',' && e.key !== ';')
          commit([suggestions[active]]);
        else commit(parseTyped(text));
      }
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function remove(index) {
    onChange(value.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  return (
    <div className="border-border/60 flex min-h-10 items-start gap-2 border-t py-1.5 first:border-t-0">
      <label htmlFor={id} className="text-muted-foreground w-8 shrink-0 pt-1.5 text-sm">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <div
          className="flex flex-wrap items-center gap-1"
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((r, i) => (
            <span
              key={`${r.address}-${i}`}
              className={cn(
                'border-border bg-muted inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1.5 pl-0.5 text-xs',
                r.invalid && 'border-destructive/50 bg-destructive/10 text-destructive'
              )}
              title={r.address}
            >
              <Avatar address={r} size="sm" className="h-5 w-5 text-[9px]" />
              <span className="truncate">{r.name || r.address}</span>
              <button
                type="button"
                aria-label={`Remove ${r.address}`}
                className="hover:bg-foreground/10 rounded-full p-0.5"
                onClick={() => remove(i)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && suggestions[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              setTimeout(() => setOpen(false), 120);
              if (text.trim()) commit(parseTyped(text));
            }}
            onFocus={() => suggestions.length && setOpen(true)}
            className="placeholder:text-muted-foreground h-7 min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
            placeholder={value.length ? '' : 'Recipients'}
            data-testid={`recipient-${label.toLowerCase()}`}
          />
        </div>
        {open && suggestions.length ? (
          <ul
            id={listId}
            role="listbox"
            className="border-border bg-popover shadow-float animate-fade-in absolute top-full left-0 z-50 mt-1 w-full max-w-md overflow-hidden rounded-xl border"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.address}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit([s]);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                  i === active && 'bg-muted'
                )}
              >
                <Avatar address={s} size="sm" />
                <span className="min-w-0">
                  {s.name ? <span className="block truncate font-medium">{s.name}</span> : null}
                  <span className="text-muted-foreground block truncate text-xs">{s.address}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 pt-1.5">{trailing}</div> : null}
    </div>
  );
}
