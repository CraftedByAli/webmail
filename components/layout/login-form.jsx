'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost } from '@/utils/api-client';
import { Logo } from '@/components/layout/logo';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    params.get('reason') === 'expired' ? 'Your session has expired. Please sign in again.' : ''
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
    <div className="animate-slide-up w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo className="h-12 w-12" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Webmail</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Use your mailbox email address and password.
          </p>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="border-border bg-card shadow-soft space-y-4 rounded-2xl border p-6"
        noValidate
      >
        {error ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {error}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              required
              className="pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="pr-10 pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Sign in
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          Your password is verified against the mail server and never stored in your browser.
        </p>
      </form>
    </div>
  );
}
