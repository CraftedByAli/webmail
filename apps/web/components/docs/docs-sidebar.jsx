'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { DOCS_NAV, DOCS_PAGES, docsHref } from '@/components/docs/nav';
import { cn } from '@/utils/cn';

function NavList({ pathname }) {
  return (
    <nav aria-label="Documentation" className="space-y-6">
      {DOCS_NAV.map((group) => (
        <div key={group.group}>
          <p className="text-meta text-fg-muted mb-1.5 px-2.5 font-semibold tracking-wide uppercase">
            {group.group}
          </p>
          <ul className="space-y-px">
            {group.pages.map((p) => {
              const href = docsHref(p.slug);
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'text-ui rounded-control focus-visible:outline-focus block px-2.5 py-1.5 transition-colors focus-visible:outline-2',
                      active
                        ? 'bg-accent-subtle text-accent-text font-medium'
                        : 'text-fg-secondary hover:bg-hover hover:text-fg'
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Desktop: a sticky rail. */
export function DocsSidebar() {
  const pathname = usePathname();
  return <NavList pathname={pathname} />;
}

/** Phones: a disclosure under the header that closes itself on navigation. */
export function DocsMobileNav() {
  const pathname = usePathname();
  const ref = useRef(null);
  const current = DOCS_PAGES.find((p) => docsHref(p.slug) === pathname);

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className="group border-line bg-canvas border-b lg:hidden">
      <summary className="text-ui text-fg flex cursor-pointer list-none items-center justify-between px-4 py-2.5 font-medium [&::-webkit-details-marker]:hidden">
        <span className="truncate">{current?.title || 'Documentation'}</span>
        <ChevronDown
          className="text-fg-muted size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="max-h-[70vh] overflow-y-auto px-2 pt-1 pb-4">
        <NavList pathname={pathname} />
      </div>
    </details>
  );
}

/** Right-hand "On this page", built from the rendered section headings. */
export function OnThisPage() {
  const pathname = usePathname();
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const headings = [...document.querySelectorAll('[data-docs-article] h2[id]')];
    list.replaceChildren(
      ...headings.map((h) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${h.id}`;
        a.textContent = h.firstChild?.textContent || h.textContent;
        a.className =
          'text-caption text-fg-muted hover:text-fg block py-1 transition-colors leading-snug';
        li.append(a);
        return li;
      })
    );
    list.parentElement.hidden = headings.length < 2;
  }, [pathname]);

  return (
    <div hidden>
      <p className="text-meta text-fg-muted mb-2 font-semibold tracking-wide uppercase">
        On this page
      </p>
      <ul ref={listRef} />
    </div>
  );
}
