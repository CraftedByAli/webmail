import { cn } from '@/utils/cn';

export function Logo({ className }) {
  return (
    <span
      className={cn(
        'bg-primary text-primary-foreground shadow-soft inline-flex items-center justify-center rounded-xl',
        className
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-[60%] w-[60%]"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    </span>
  );
}
