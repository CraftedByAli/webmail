/**
 * Documentation table of contents. Order here is reading order: the sidebar,
 * the previous/next links and static generation all come from this list.
 */
export const DOCS_NAV = [
  {
    group: 'Getting started',
    pages: [
      {
        slug: '',
        title: 'Introduction',
        description: 'What OsmicMails is and how it fits next to Mailcow.',
      },
      {
        slug: 'quick-start',
        title: 'Quick start',
        description: 'Run OsmicMails in minutes: on a Mailcow host, with Docker, or from source.',
      },
    ],
  },
  {
    group: 'Integrate',
    pages: [
      {
        slug: 'mailcow',
        title: 'Mailcow & replacing SOGo',
        description:
          'Add OsmicMails to mailcow: dockerized and make it the webmail your users get.',
      },
      {
        slug: 'docker',
        title: 'Standalone Docker',
        description: 'Run OsmicMails on its own host against any Mailcow or IMAP/SMTP server.',
      },
      {
        slug: 'reverse-proxy',
        title: 'Reverse proxy & HTTPS',
        description: 'Nginx, Caddy, Traefik and Cloudflare configurations.',
      },
    ],
  },
  {
    group: 'Reference',
    pages: [
      {
        slug: 'configuration',
        title: 'Configuration',
        description: 'Every environment variable, with defaults.',
      },
      {
        slug: 'security',
        title: 'Security',
        description: 'How OsmicMails protects mailboxes, and the operator hardening checklist.',
      },
      {
        slug: 'operations',
        title: 'Updates, backups & monitoring',
        description: 'Keeping an instance healthy in production.',
      },
      {
        slug: 'troubleshooting',
        title: 'Troubleshooting',
        description: 'Symptoms, causes and fixes for common problems.',
      },
    ],
  },
];

export const DOCS_PAGES = DOCS_NAV.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.group })));

export const docsHref = (slug) => (slug ? `/docs/${slug}` : '/docs');

export function findDocsPage(slug) {
  const index = DOCS_PAGES.findIndex((p) => p.slug === slug);
  if (index === -1) return null;
  return { page: DOCS_PAGES[index], prev: DOCS_PAGES[index - 1], next: DOCS_PAGES[index + 1] };
}
