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
 * Address entry as removable chips with suggestions from the address book and
 * from people the user has actually corresponded with.
 *
 * Invalid addresses are kept as chips and marked, rather than silently dropped,
 * so a typo is visible before sending instead of bouncing afterwards.
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

  const invalidCount = value.filter((v) => v.invalid).length;

  return (
    <div className="border-line flex min-h-9 items-start gap-2 border-t py-1 first:border-t-0">
      <label htmlFor={id} className="text-ui text-fg-muted w-12 shrink-0 pt-1.5">
        {label}
      </label>

      <div className="relative min-w-0 flex-1">
        {}
        <div
          className="flex flex-wrap items-center gap-1 py-0.5"
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((r, i) => (
            <span
              key={`${r.address}-${i}`}
              className={cn(
                'rounded-pill text-caption inline-flex max-w-full items-center gap-1 py-0.5 pr-1 pl-0.5',
                r.invalid ? 'bg-danger-subtle text-danger' : 'bg-hover text-fg'
              )}
              title={r.invalid ? `${r.address} is not a valid address` : r.address}
            >
              <Avatar
                address={r}
                size="xs"
                className={cn(r.invalid && 'bg-danger/15 text-danger ring-danger/20')}
              />
              <span className="truncate">{r.name || r.address}</span>
              <button
                type="button"
                aria-label={`Remove ${r.address}`}
                className="rounded-pill hover:bg-active focus-visible:outline-focus grid size-4 shrink-0 place-items-center focus-visible:outline-2 focus-visible:outline-offset-1"
                onClick={() => remove(i)}
              >
                <X className="size-3" />
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
            className="text-ui text-fg placeholder:text-fg-muted h-6 min-w-32 flex-1 bg-transparent outline-none"
            placeholder={value.length ? '' : 'Add people'}
            data-testid={`recipient-${label.toLowerCase()}`}
          />
        </div>

        {invalidCount > 0 ? (
          <p className="text-caption text-danger pb-1">
            {invalidCount === 1
              ? 'One address is not valid.'
              : `${invalidCount} addresses are not valid.`}
          </p>
        ) : null}

        {open && suggestions.length ? (
          <ul
            id={listId}
            role="listbox"
            className="overlay-in border-line bg-surface shadow-overlay rounded-surface absolute top-full left-0 z-50 mt-1 w-full max-w-md overflow-hidden border p-1"
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
                  'rounded-control flex cursor-pointer items-center gap-2 px-2 py-1.5',
                  i === active && 'bg-hover'
                )}
              >
                <Avatar address={s} size="sm" />
                <span className="min-w-0">
                  {s.name ? <span className="text-ui text-fg block truncate">{s.name}</span> : null}
                  <span className="text-caption text-fg-muted block truncate">{s.address}</span>
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
