import { headers } from 'next/headers';
import './globals.css';
import { Providers } from '@/components/layout/providers';

export const metadata = {
  title: { default: 'OsmicMails', template: '%s · OsmicMails' },
  description: 'OsmicMails — fast, secure business email for every mailbox on your domain.',
  applicationName: 'OsmicMails',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'OsmicMails', statusBarStyle: 'default' },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111318' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Android: shrink the layout when the keyboard opens so the full-screen
  // compose window keeps its Send bar visible. iOS ignores it.
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({ children }) {
  const nonce = (await headers()).get('x-nonce') || undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
