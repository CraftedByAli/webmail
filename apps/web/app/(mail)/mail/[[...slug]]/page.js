import { Suspense } from 'react';
import { MailView } from '@/components/mail/mail-view';

export const metadata = { title: 'Mail' };

export default function MailPage() {
  return (
    <Suspense>
      <MailView />
    </Suspense>
  );
}
