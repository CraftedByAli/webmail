import { Suspense } from 'react';
import { LoginForm } from '@/components/layout/login-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="from-background via-background to-accent/40 flex min-h-dvh items-center justify-center bg-gradient-to-br px-4 py-10">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
