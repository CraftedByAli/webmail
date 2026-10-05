import Link from 'next/link';
import { Info, TriangleAlert, ShieldCheck, Lightbulb } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Building blocks for the documentation pages. Prose is set in the reading
 * size with a comfortable measure; everything else reuses the app's tokens so
 * the docs look like part of the product, not a separate site.
 */

export function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="mb-8">
      {eyebrow ? (
        <p className="text-caption text-accent-text mb-2 font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-fg text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
        {title}
      </h1>
      {children ? (
        <p className="text-read text-fg-secondary mt-3 max-w-[62ch]">{children}</p>
      ) : null}
    </header>
  );
}

export function H2({ id, children }) {
  return (
    <h2
      id={id}
      className="group text-fg border-line mt-12 mb-3 scroll-mt-20 border-t pt-8 text-[1.25rem] leading-snug font-semibold tracking-tight first:mt-0 first:border-t-0 first:pt-0"
    >
      {children}
      <a
        href={`#${id}`}
        aria-label="Link to this section"
        className="text-fg-muted ml-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        #
      </a>
    </h2>
  );
}

export function H3({ id, children }) {
  return (
    <h3 id={id} className="text-title text-fg mt-8 mb-2 scroll-mt-20 font-semibold tracking-tight">
      {children}
    </h3>
  );
}

export function P({ children, className }) {
  return <p className={cn('text-read text-fg-secondary my-3', className)}>{children}</p>;
}

export function UL({ children }) {
  return (
    <ul className="text-read text-fg-secondary marker:text-fg-muted my-3 list-disc space-y-1.5 pl-6">
      {children}
    </ul>
  );
}

export function OL({ children }) {
  return (
    <ol className="text-read text-fg-secondary marker:text-fg-muted my-3 list-decimal space-y-1.5 pl-6">
      {children}
    </ol>
  );
}

/** Inline code. */
export function C({ children }) {
  return (
    <code className="bg-sunken border-line text-fg rounded-tight border px-1 py-px font-mono text-[0.85em] break-words">
      {children}
    </code>
  );
}

export function A({ href, children }) {
  const external = /^https?:\/\//.test(href);
  const className =
    'text-accent-text underline decoration-1 underline-offset-2 hover:text-accent-hover';
  return external ? (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

const CALLOUTS = {
  note: { icon: Info, className: 'border-info/30 bg-info-subtle', iconClass: 'text-info' },
  tip: {
    icon: Lightbulb,
    className: 'border-success/30 bg-success-subtle',
    iconClass: 'text-success',
  },
  warning: {
    icon: TriangleAlert,
    className: 'border-warning/35 bg-warning-subtle',
    iconClass: 'text-warning',
  },
  security: {
    icon: ShieldCheck,
    className: 'border-accent/30 bg-accent-subtle',
    iconClass: 'text-accent-text',
  },
};

export function Callout({ type = 'note', title, children }) {
  const { icon: Icon, className, iconClass } = CALLOUTS[type];
  return (
    <div className={cn('rounded-surface my-5 flex gap-3 border px-4 py-3', className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconClass)} aria-hidden="true" />
      <div className="text-body text-fg min-w-0 [&_p]:my-1.5 [&_p]:text-[length:inherit]">
        {title ? <p className="!mt-0 font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** Numbered procedure. Each child <Step> is one action the reader performs. */
export function Steps({ children }) {
  return <ol className="my-6 space-y-8 [counter-reset:step]">{children}</ol>;
}

export function Step({ title, id, children }) {
  return (
    <li className="relative pl-10 [counter-increment:step]">
      <span
        aria-hidden="true"
        className="bg-accent-subtle text-accent-text text-caption rounded-pill absolute top-0 left-0 grid size-7 place-items-center font-semibold before:content-[counter(step)]"
      />
      <h3 id={id} className="text-title text-fg scroll-mt-20 pt-0.5 font-semibold">
        {title}
      </h3>
      <div className="[&>*:first-child]:mt-2">{children}</div>
    </li>
  );
}

export function Table({ head, rows, className }) {
  return (
    <div className={cn('border-line rounded-surface my-5 overflow-x-auto border', className)}>
      <table className="text-body w-full border-collapse text-left">
        <thead className="bg-sunken">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-line text-caption text-fg-muted border-b px-3.5 py-2 font-semibold tracking-wide whitespace-nowrap uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-line border-b last:border-b-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    'text-fg-secondary px-3.5 py-2.5 align-top',
                    j === 0 && 'text-fg font-medium'
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Linked card for "where to go next" grids. */
export function Card({ href, title, icon: Icon, children }) {
  return (
    <Link
      href={href}
      className="border-line bg-surface hover:border-line-strong hover:bg-hover rounded-surface focus-visible:outline-focus group block border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="flex items-center gap-2">
        {Icon ? <Icon className="text-accent-text size-4 shrink-0" aria-hidden="true" /> : null}
        <span className="text-ui text-fg font-semibold">{title}</span>
      </span>
      <span className="text-body text-fg-secondary mt-1 block">{children}</span>
    </Link>
  );
}

export function Cards({ children }) {
  return <div className="my-6 grid gap-3 sm:grid-cols-2">{children}</div>;
}
