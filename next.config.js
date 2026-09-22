/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  // Native / Node-only packages must not be bundled by the server compiler.
  serverExternalPackages: [
    'better-sqlite3',
    'imapflow',
    'nodemailer',
    'mailparser',
    'pino',
    'pino-pretty',
    'file-type',
  ],
  // Keep the standalone bundle small: these are never needed at runtime.
  outputFileTracingExcludes: {
    '*': [
      './data/**',
      './deploy/**',
      './docs/**',
      './tests/**',
      './test-results/**',
      './playwright-report/**',
      './.claude/**',
    ],
  },
  experimental: {
    // Route handlers that stream large attachments must not be buffered.
    proxyTimeout: 120_000,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

export default nextConfig;
