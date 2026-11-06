import { PageHeader, H2, P, C, A, Callout, Table } from '@/components/docs/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import { IMAGE, REPO_GIT } from '@/components/docs/site';

export default function QuickStart() {
  return (
    <>
      <PageHeader eyebrow="Getting started" title="Quick start">
        Pick the path that matches where your mail server runs. All three end with the same app;
        they differ only in how it is packaged and reached.
      </PageHeader>

      <Table
        head={['Your setup', 'Use', 'Time']}
        rows={[
          [
            'mailcow: dockerized on this server',
            <A key="a" href="#mailcow">
              Mailcow add-on (installer)
            </A>,
            '~5 min',
          ],
          [
            'Mail server elsewhere, or not Mailcow',
            <A key="b" href="#docker">
              Standalone Docker
            </A>,
            '~10 min',
          ],
          [
            'No Docker, or you want to hack on it',
            <A key="c" href="#source">
              From source
            </A>,
            '~10 min',
          ],
        ]}
      />

      <H2 id="mailcow">On a Mailcow host</H2>
      <P>
        Point a DNS record for the webmail (e.g. <C>webmail.example.com</C>) at the Mailcow server,
        then run the installer as root:
      </P>
      <CodeBlock title="shell">{`git clone ${REPO_GIT} /opt/osmicmails
cd /opt/osmicmails/deploy/mailcow
sudo ./install.sh`}</CodeBlock>
      <P>
        It asks for the hostname, starts OsmicMails on Mailcow&apos;s internal network, adds the
        name to Mailcow&apos;s certificate, serves it through Mailcow&apos;s nginx and redirects
        SOGo&apos;s webmail to it. Nothing changes in Mailcow without a prompt. Details and the
        manual equivalent: <A href="/docs/mailcow">Mailcow &amp; replacing SOGo</A>.
      </P>

      <H2 id="docker">Standalone Docker</H2>
      <P>On any host that can reach your mail server on ports 993, 587 and 4190:</P>
      <CodeBlock title="shell">{`mkdir -p /opt/osmicmails && cd /opt/osmicmails
cat > .env <<EOF
APP_URL=https://webmail.example.com
SESSION_SECRET=$(openssl rand -hex 32)
MAIL_IMAP_HOST=mail.example.com
MAIL_SMTP_HOST=mail.example.com
EOF
chmod 600 .env

docker run -d --name osmicmails --restart unless-stopped \\
  --env-file .env -p 127.0.0.1:3000:3000 \\
  -v osmicmails-data:/data --read-only --tmpfs /tmp --tmpfs /app/.next/cache \\
  --cap-drop ALL --security-opt no-new-privileges \\
  ${IMAGE}:latest`}</CodeBlock>
      <P>
        Then put a reverse proxy with HTTPS in front of <C>127.0.0.1:3000</C> — see{' '}
        <A href="/docs/reverse-proxy">Reverse proxy &amp; HTTPS</A>. The full walkthrough, with a
        Compose file, is in <A href="/docs/docker">Standalone Docker</A>.
      </P>

      <H2 id="source">From source</H2>
      <CodeBlock title="shell">{`git clone ${REPO_GIT} osmicmails && cd osmicmails
npm ci
cp .env.example .env      # set APP_URL, SESSION_SECRET, MAIL_IMAP_HOST, MAIL_SMTP_HOST
npm run build
npm start                 # http://localhost:3000`}</CodeBlock>
      <Callout type="tip" title="Try it without a mail server">
        <p>
          Set <C>MAIL_PROVIDER=mock</C> in <C>.env</C> and run <C>npm run dev</C>. Sign in with{' '}
          <C>test@example.com</C> / <C>password123</C>. The mock provider is refused in production
          builds.
        </p>
      </Callout>

      <H2 id="check">Check the connection</H2>
      <P>
        Before inviting users, confirm that the server can authenticate against IMAP and SMTP with a
        real mailbox. In a source checkout:
      </P>
      <CodeBlock title="shell">{`MAIL_USER=you@example.com MAIL_PASS='your-password' npm run check:mailcow`}</CodeBlock>
      <P>
        It prints the IMAP capabilities and folders it finds, and whether SMTP accepted the login.
        Then open <C>/api/ready</C> on your instance: it returns <C>200</C> when the database is
        writable and the mail ports are reachable.
      </P>
    </>
  );
}
