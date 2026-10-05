import { useId } from 'react';
import { cn } from '@/utils/cn';

export const BRAND_NAME = 'OsmicMails';

/**
 * The OsmicMails mark: an envelope held in an orbit, with a satellite in the
 * gap of the ring. Same geometry as public/icons/icon.svg so the favicon, the
 * installed app icon and the in-app mark are one shape.
 */
export function LogoMark({ className, title }) {
  const id = useId();
  const gradient = `om-bg-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradient} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5B3DF5" />
          <stop offset="0.55" stopColor="#3B5BDB" />
          <stop offset="1" stopColor="#0EA5C6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      <path
        d="M48.42 27.6A17 17 0 1 1 36.4 15.58"
        fill="none"
        stroke="#fff"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <rect
        x="22.25"
        y="25"
        width="19.5"
        height="14"
        rx="3"
        fill="#fff"
        fillOpacity="0.16"
        stroke="#fff"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="m23.5 27 8.5 6 8.5-6"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44.02" cy="19.98" r="3.6" fill="#FFD166" />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({ className, textClassName, showText = true, size = 'md' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={size === 'lg' ? 'size-9' : 'size-7'} />
      {showText ? (
        <span
          className={cn(
            'text-fg font-bold tracking-tight',
            size === 'lg' ? 'text-[1.375rem] leading-none' : 'text-body',
            textClassName
          )}
        >
          Osmic<span className="text-accent-text">Mails</span>
        </span>
      ) : null}
    </span>
  );
}
