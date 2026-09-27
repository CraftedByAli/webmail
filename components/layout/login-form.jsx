'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { apiPost } from '@/utils/api-client';
import { Logo } from '@/components/layout/logo';

/**
 * Sign-in. One column, one primary action, no ornament — the screen exists to
 * be passed through, not admired.
 */
export function LoginForm({ host }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    params.get('reason') === 'expired' ? 'Your session expired. Please sign in again.' : ''
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiPost('/api/auth/login', { email, password });
      const next = params.get('next');
      const safeNext =
        next && next.startsWith('/') && !next.startsWith('//') ? next : '/mail/inbox';
      router.replace(safeNext);
      router.refresh();
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[22rem]">
      <Logo className="mb-7" size="lg" />

      <h1 className="text-display text-fg font-semibold tracking-tight">Sign in</h1>
      <p className="text-body text-fg-secondary mt-1">
        {host ? (
          <>
            Use your mailbox address and password for <span className="text-fg">{host}</span>.
          </>
        ) : (
          'Use your mailbox address and password.'
        )}
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        {error ? (
          <p
            role="alert"
            className="bg-danger-subtle text-ui text-danger rounded-control px-3 py-2"
          >
            {error}
          </p>
        ) : null}

        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            required
            className="h-9"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="h-9 pr-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-focus rounded-control absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={loading}>
          Sign in
        </Button>
      </form>

      <p className="text-caption text-fg-muted mt-6">
        Your password is checked against the mail server and is never stored in this browser.
      </p>
    </div>
  );
}
