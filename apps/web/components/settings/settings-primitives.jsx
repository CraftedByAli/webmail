'use client';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/cn';

/**
 * Settings are grouped by heading and separated by hairlines — not boxed in
 * cards. A card around every group turns a settings page into a stack of
 * identical tiles where nothing is more important than anything else.
 */
export function SettingsSection({ title, description, children, className }) {
  return (
    <section className={cn('border-line border-t pt-6 first:border-t-0 first:pt-0', className)}>
      <h2 className="text-title text-fg font-semibold">{title}</h2>
      {description ? (
        <p className="text-body text-fg-secondary mt-1 max-w-prose">{description}</p>
      ) : null}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export function SettingRow({ label, description, htmlFor, children, stacked }) {
  return (
    <div
      className={cn(
        'gap-x-6 gap-y-2',
        stacked ? 'grid' : 'grid sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center'
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={htmlFor}>{label}</Label>
        {description ? <p className="text-caption text-fg-muted mt-0.5">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ToggleRow({ id, label, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {description ? (
          <p className="text-caption text-fg-muted mt-0.5 max-w-prose">{description}</p>
        ) : null}
      </div>
      <Switch id={id} checked={!!checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}
