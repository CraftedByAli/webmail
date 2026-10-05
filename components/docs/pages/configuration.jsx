import { PageHeader, H2, P, C, A, Callout, Table } from '@/components/docs/primitives';

const v = (name) => <C key={name}>{name}</C>;

export default function Configuration() {
  return (
    <>
      <PageHeader eyebrow="Reference" title="Configuration">
        OsmicMails is configured entirely through environment variables — usually an <C>.env</C>{' '}
        file passed to the container. Settings are read at startup; restart the container after
        changing them. Invalid or missing required values stop the server immediately instead of
        failing later.
      </PageHeader>

      <H2 id="application">Application</H2>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [
            v('APP_URL'),
            'http://localhost:3000',
            'Public URL users open, e.g. https://webmail.example.com. Required in production.',
          ],
          [
            v('SESSION_SECRET'),
            '— (required)',
            'At least 32 random characters (openssl rand -hex 32). Encrypts stored mailbox credentials; changing it signs everyone out.',
          ],
          [v('SESSION_TTL_HOURS'), '168', 'Sliding session lifetime in hours.'],
          [
            v('MAX_MAILBOXES_PER_SESSION'),
            '10',
            'Mailboxes one browser can be signed in to at once (1–20).',
          ],
          [
            v('ADMIN_EMAILS'),
            '(empty)',
            'Comma-separated mailboxes allowed to open /admin/diagnostics.',
          ],
          [
            v('DOCS_ENABLED'),
            'true',
            'Serve this documentation at /docs. Set false to hide it from your users.',
          ],
        ]}
      />

      <H2 id="proxy">Reverse proxy</H2>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [
            v('TRUST_PROXY_HOPS'),
            '1',
            'Proxies in front of the app that append to X-Forwarded-For. The client IP is read this many entries from the right. See Reverse proxy.',
          ],
          [
            v('TRUST_CLOUDFLARE'),
            'false',
            'Use CF-Connecting-IP. Only safe when the origin accepts Cloudflare traffic alone.',
          ],
        ]}
      />

      <H2 id="imap">IMAP (Dovecot)</H2>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [
            v('MAIL_IMAP_HOST'),
            '— (required)',
            'IMAP server, e.g. mail.example.com, or dovecot-mailcow on the Mailcow network.',
          ],
          [v('MAIL_IMAP_PORT'), '993', 'IMAP port.'],
          [v('MAIL_IMAP_TLS'), 'true', 'true = implicit TLS (IMAPS, 993). false = STARTTLS (143).'],
          [v('IMAP_POOL_SIZE'), '3', 'IMAP connections per signed-in mailbox.'],
          [
            v('IMAP_IDLE_TIMEOUT_SECONDS'),
            '300',
            'Close unused pooled connections after this many seconds.',
          ],
        ]}
      />

      <H2 id="smtp">SMTP (Postfix submission)</H2>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [
            v('MAIL_SMTP_HOST'),
            '— (required)',
            'Submission server, e.g. mail.example.com, or postfix-mailcow.',
          ],
          [v('MAIL_SMTP_PORT'), '587', 'Submission port.'],
          [v('MAIL_SMTP_SECURE'), 'false', 'true = implicit TLS (465). false = STARTTLS (587).'],
          [v('MAIL_SMTP_REQUIRE_TLS'), 'true', 'Refuse to authenticate unless STARTTLS succeeded.'],
        ]}
      />

      <H2 id="tls">TLS verification</H2>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [
            v('MAIL_TLS_SERVERNAME'),
            '(empty)',
            'Certificate name to verify for IMAP, SMTP and ManageSieve when the hosts are internal names. Set to MAILCOW_HOSTNAME on a Mailcow host. Empty = verify the host name itself.',
          ],
          [
            v('MAIL_TLS_REJECT_UNAUTHORIZED'),
            'true',
            'Reject invalid certificates. Only false in a throw-away lab.',
          ],
        ]}
      />
      <Callout type="security">
        <p>
          Prefer <C>MAIL_TLS_SERVERNAME</C> to disabling verification: the connection stays
          authenticated, so nothing on the network can impersonate your mail server.
        </p>
      </Callout>

      <H2 id="sieve">ManageSieve & forwarding</H2>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [v('MAIL_SIEVE_ENABLED'), 'true', 'Use ManageSieve (needed for forwarding).'],
          [v('MAIL_SIEVE_HOST'), 'MAIL_IMAP_HOST', 'ManageSieve server.'],
          [v('MAIL_SIEVE_PORT'), '4190', 'ManageSieve port.'],
          [v('MAIL_SIEVE_REQUIRE_TLS'), 'true', 'Require STARTTLS before sending credentials.'],
          [v('MAIL_SIEVE_TIMEOUT_SECONDS'), '15', 'Network timeout for ManageSieve.'],
          [v('MAIL_FORWARDING_ENABLED'), 'true', 'Let users set up forwarding.'],
          [v('MAX_FORWARD_ADDRESSES'), '4', 'Forwarding addresses per mailbox (1–20).'],
          [
            v('MAIL_FORWARDING_ALLOWED_DOMAINS'),
            '(empty = any)',
            'Comma-separated destination domains, to keep mail inside approved domains.',
          ],
        ]}
      />

      <H2 id="limits">Limits & storage</H2>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [
            v('MAX_ATTACHMENT_SIZE_MB'),
            '50',
            'Largest single attachment. Keep the proxy body limit above it.',
          ],
          [
            v('MAX_MESSAGE_SIZE_MB'),
            '60',
            'Caps the total attachments of an outgoing message and how much of a message is downloaded for viewing. Keep below the mail server limit.',
          ],
          [
            v('DATABASE_PATH'),
            '/data/webmail.db (image)',
            'SQLite file for sessions, preferences, contacts and signatures.',
          ],
          [
            v('UPLOAD_DIR'),
            '/data/uploads (image)',
            'Temporary storage for attachments being composed.',
          ],
        ]}
      />

      <H2 id="logging">Logging</H2>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [v('LOG_LEVEL'), 'info', 'trace, debug, info, warn or error.'],
          [v('LOG_FORMAT'), 'json (production)', 'json for log collectors, pretty for humans.'],
        ]}
      />
      <P>
        Logs never contain passwords, session tokens or cookies; see{' '}
        <A href="/docs/security">Security</A>.
      </P>

      <H2 id="compose-only">Mailcow add-on (Compose only)</H2>
      <P>
        Read by <C>deploy/mailcow/docker-compose.yml</C>, not by the app:
      </P>
      <Table
        head={['Variable', 'Default', 'Description']}
        rows={[
          [
            v('MAILCOW_NETWORK'),
            'mailcowdockerized_mailcow-network',
            'Mailcow’s Docker network: <COMPOSE_PROJECT_NAME>_mailcow-network.',
          ],
          [
            v('OSMICMAILS_IMAGE'),
            'ghcr.io/craftedbyali/osmicmails:latest',
            'Image to run; pin a version tag here.',
          ],
          [
            v('OSMICMAILS_BIND'),
            '127.0.0.1:3004',
            'Loopback port for health checks or an outer reverse proxy.',
          ],
        ]}
      />
    </>
  );
}
