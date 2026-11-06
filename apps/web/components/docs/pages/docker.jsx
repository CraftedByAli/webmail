import { PageHeader, H2, P, UL, C, A, Callout, Steps, Step } from '@/components/docs/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import { IMAGE, REPO_GIT } from '@/components/docs/site';

export default function DockerGuide() {
  return (
    <>
      <PageHeader eyebrow="Integrate" title="Standalone Docker">
        Run OsmicMails on its own host — next to a Mailcow server elsewhere, or in front of any
        IMAP/SMTP server that offers IMAPS and submission with STARTTLS.
      </PageHeader>

      <H2 id="requirements">Requirements</H2>
      <UL>
        <li>Docker Engine with the Compose plugin.</li>
        <li>
          Outbound access from this host to the mail server on 993 (IMAPS), 587 (submission) and,
          for forwarding, 4190 (ManageSieve).
        </li>
        <li>A DNS name for the webmail and a reverse proxy that terminates HTTPS.</li>
      </UL>

      <H2 id="install">Install</H2>
      <Steps>
        <Step title="Create the configuration" id="config">
          <CodeBlock title="shell">{`mkdir -p /opt/osmicmails && cd /opt/osmicmails
cat > .env <<EOF
APP_URL=https://webmail.example.com
SESSION_SECRET=$(openssl rand -hex 32)
MAIL_IMAP_HOST=mail.example.com
MAIL_SMTP_HOST=mail.example.com
ADMIN_EMAILS=admin@example.com
TRUST_PROXY_HOPS=1
EOF
chmod 600 .env`}</CodeBlock>
          <P>
            Every other setting has a safe default; see{' '}
            <A href="/docs/configuration">Configuration</A>.
          </P>
        </Step>

        <Step title="Add a Compose file" id="compose">
          <CodeBlock title="/opt/osmicmails/docker-compose.yml">{`services:
  osmicmails:
    image: ${IMAGE}:\${OSMICMAILS_VERSION:-latest}
    container_name: osmicmails
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
    ports:
      - '127.0.0.1:3000:3000'   # only the reverse proxy on this host can reach it
    volumes:
      - osmicmails-data:/data
    read_only: true
    tmpfs:
      - /tmp
      - /app/.next/cache
    cap_drop: [ALL]
    security_opt: ['no-new-privileges:true']
    deploy:
      resources:
        limits:
          memory: 768M

volumes:
  osmicmails-data:`}</CodeBlock>
          <Callout type="tip" title="Pin a version">
            <p>
              Set <C>OSMICMAILS_VERSION</C> to a released tag (e.g. <C>0.3.0</C>) in the shell or a
              Compose <C>.env</C> to upgrade deliberately instead of following <C>latest</C>.
            </p>
          </Callout>
        </Step>

        <Step title="Start and check it" id="start">
          <CodeBlock title="shell">{`docker compose up -d
docker compose ps                      # STATUS shows (healthy)
curl -s http://127.0.0.1:3000/api/ready`}</CodeBlock>
          <P>
            <C>/api/ready</C> answers <C>200</C> once the database is writable and the IMAP and SMTP
            ports are reachable, and <C>503</C> otherwise.
          </P>
        </Step>

        <Step title="Publish it over HTTPS" id="proxy">
          <P>
            Add a site to your reverse proxy that forwards to <C>127.0.0.1:3000</C>. Ready-made
            configurations for Nginx, Caddy, Traefik and Cloudflare are in{' '}
            <A href="/docs/reverse-proxy">Reverse proxy &amp; HTTPS</A>.
          </P>
        </Step>
      </Steps>

      <H2 id="mailcow-remote">Pointing at a remote Mailcow</H2>
      <UL>
        <li>
          Use Mailcow&apos;s public hostname for <C>MAIL_IMAP_HOST</C> and <C>MAIL_SMTP_HOST</C>;
          its certificate matches, so leave <C>MAIL_TLS_SERVERNAME</C> empty.
        </li>
        <li>
          Allow-list this host&apos;s IP in Mailcow&apos;s Fail2ban parameters. Every webmail user
          connects from it, so without the entry a few failed logins can ban all of them.
        </li>
        <li>
          Firewall the mail server so 4190 (ManageSieve) is only reachable from hosts that need it.
        </li>
      </UL>

      <H2 id="other-servers">Other mail servers</H2>
      <P>
        Anything that speaks standard IMAP and SMTP works, such as plain Dovecot with Postfix.
        Dovecot-specific extras (server-side threading, ManageSieve forwarding) are used when the
        server advertises them. Set <C>MAIL_SIEVE_ENABLED=false</C> if the server has no
        ManageSieve.
      </P>

      <H2 id="build">Building the image yourself</H2>
      <CodeBlock title="shell">{`git clone ${REPO_GIT} osmicmails && cd osmicmails
docker build -t osmicmails:local .`}</CodeBlock>
      <P>
        The image runs as an unprivileged user, works with a read-only root filesystem as above,
        keeps its state in <C>/data</C>, and reports health on <C>/api/health</C>.
      </P>
    </>
  );
}
