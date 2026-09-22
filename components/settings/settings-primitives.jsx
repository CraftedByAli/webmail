'use client';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export function SettingsSection({ title, description, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      <div className="divide-border border-border bg-card mt-4 divide-y rounded-2xl border">
        {children}
      </div>
    </section>
  );
}

export function SettingRow({ label, description, htmlFor, children }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description ? <p className="text-muted-foreground mt-0.5 text-xs">{description}</p> : null}
      </div>
      <div className="shrink-0 sm:w-56">{children}</div>
    </div>
  );
}

export function ToggleRow({ id, label, description, checked, onChange }) {
  return (
    <SettingRow label={label} description={description} htmlFor={id}>
      <div className="flex justify-end">
        <Switch id={id} checked={!!checked} onCheckedChange={onChange} />
      </div>
    </SettingRow>
  );
}
