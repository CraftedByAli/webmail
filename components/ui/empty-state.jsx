import { cn } from '@/utils/cn';

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'animate-fade-in flex h-full min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center',
        className
      )}
    >
      {Icon ? (
        <div className="bg-muted text-muted-foreground mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
