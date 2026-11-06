import {
  PageHeader,
  H2,
  H3,
  P,
  UL,
  OL,
  C,
  A,
  Callout,
  Steps,
  Step,
  Table,
} from '@/components/docs/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import {
  NGINX_SITE_TEMPLATE,
  SOGO_REDIRECT_TEMPLATE,
  MAILCOW_COMPOSE,
  MAILCOW_ENV_EXAMPLE,
  renderTemplate,
} from '@/components/docs/snippets';
import { REPO_GIT } from '@/components/docs/site';

export default function MailcowGuide() {
  return (
    <>
      <PageHeader eyebrow="Integrate" title="Mailcow & replacing SOGo">
        Run OsmicMails on the same server as mailcow: dockerized, behind Mailcow&apos;s own nginx
        and certificate, and make it the webmail your users land on. Mailcow itself needs no code
        changes, and its updates keep working.
      </PageHeader>

      <H2 id="architecture">What you end up with</H2>
      <CodeBlock title="request flow">{`browser ──HTTPS──▶ nginx-mailcow (webmail.example.com, Mailcow's certificate)
                        │
                        ▼
                  osmicmails-mailcow:3000      own Compose project, on mailcow's network
                        ├── IMAPS 993  ──▶ dovecot-mailcow
                        ├── SMTP 587   ──▶ postfix-mailcow   (STARTTLS)
                        └── Sieve 4190 ──▶ dovecot-mailcow   (STARTTLS)

mail.example.com/SOGo  ──302──▶  https://webmail.example.com/`}</CodeBlock>
      <UL>
        <li>
          OsmicMails is a <strong className="text-fg">separate Compose project</strong> that joins
          Mailcow&apos;s Docker network. Mailcow&apos;s <C>update.sh</C> never touches it, and you
          can update either one independently.
        </li>
        <li>
          Mail traffic never leaves the host. Connections use TLS and the certificate is verified
          against your <C>MAILCOW_HOSTNAME</C> (see <A href="#tls-servername">why that matters</A>).
        </li>
        <li>
          No ports are opened to the internet. Users reach OsmicMails through <C>nginx-mailcow</C>{' '}
          on 443, with the certificate Mailcow already renews.
        </li>
        <li>
          SOGo&apos;s webmail entry points redirect to OsmicMails. SOGo&apos;s calendars, contacts
          (CalDAV/CardDAV) and ActiveSync keep working unless you{' '}
          <A href="#remove-sogo">remove SOGo</A>.
        </li>
      </UL>

      <H2 id="prerequisites">Before you start</H2>
      <UL>
        <li>
          A running mailcow: dockerized installation, by default in <C>/opt/mailcow-dockerized</C>,
          and a root shell on that server.
        </li>
        <li>
          A hostname for the webmail, separate from <C>MAILCOW_HOSTNAME</C> — e.g.{' '}
          <C>webmail.example.com</C>. Create an <C>A</C>/<C>AAAA</C> record (or a <C>CNAME</C> to
          your Mailcow hostname) before installing, so Mailcow can obtain the certificate.
        </li>
        <li>
          <C>git</C> on the server, and outbound access to <C>ghcr.io</C> (or build the image
          locally with <C>--build</C>).
        </li>
      </UL>
      <Callout type="note" title="Why a separate hostname?">
        <p>
          Mailcow&apos;s own UI, autodiscover and SOGo live on <C>MAILCOW_HOSTNAME</C>. A dedicated
          name keeps OsmicMails&apos;s cookies, Content-Security-Policy and paths fully separate
          from Mailcow&apos;s admin interface.
        </p>
      </Callout>

      <H2 id="installer">Install with the installer</H2>
      <CodeBlock title="shell (as root on the Mailcow server)">{`git clone ${REPO_GIT} /opt/osmicmails
cd /opt/osmicmails/deploy/mailcow
./install.sh`}</CodeBlock>
      <P>The installer:</P>
      <OL>
        <li>
          Reads <C>MAILCOW_HOSTNAME</C> and <C>COMPOSE_PROJECT_NAME</C> from <C>mailcow.conf</C> and
          checks that Mailcow&apos;s network exists.
        </li>
        <li>
          Creates <C>deploy/mailcow/.env</C> (mode <C>600</C>) with a fresh <C>SESSION_SECRET</C>.
          On later runs the existing file and secret are kept.
        </li>
        <li>
          Pulls the image (or builds it with <C>--build</C>), starts it and waits until it is
          healthy.
        </li>
        <li>
          Asks to add the hostname to <C>ADDITIONAL_SAN</C> (after backing up <C>mailcow.conf</C>)
          and to recreate <C>acme-mailcow</C> so the certificate is reissued.
        </li>
        <li>
          Writes <C>data/conf/nginx/osmicmails.conf</C> and, if you agree,{' '}
          <C>site.osmicmails.custom</C> (the SOGo redirect), then restarts <C>nginx-mailcow</C> —
          only after <C>nginx -t</C> accepts the files. If it does not, the previous files are
          restored.
        </li>
      </OL>
      <Table
        head={['Option', 'Effect']}
        rows={[
          [<C key="1">--hostname NAME</C>, 'Webmail hostname (default webmail.<your domain>)'],
          [<C key="2">--mailcow-dir DIR</C>, 'Mailcow folder (default /opt/mailcow-dockerized)'],
          [<C key="3">--admin EMAIL</C>, 'Mailbox allowed to open /admin/diagnostics'],
          [<C key="4">--build</C>, 'Build the image from the checkout instead of pulling it'],
          [<C key="5">--keep-sogo</C>, 'Leave SOGo’s web UI as it is'],
          [<C key="6">--yes</C>, 'Non-interactive: accept every default'],
          [<C key="7">--uninstall</C>, 'Remove the nginx files and stop OsmicMails (data is kept)'],
        ]}
      />
      <P>
        Open <C>https://webmail.example.com</C> and sign in with any mailbox address and its
        password. If the browser warns about the certificate, Mailcow has not finished issuing it
        yet — follow <C>docker compose logs -f acme-mailcow</C> in the Mailcow folder.
      </P>

      <H2 id="manual">Install by hand</H2>
      <P>
        The same result without the script — useful if you manage the server with configuration
        management, or want to see every change.
      </P>
      <Steps>
        <Step title="Get the bundle" id="manual-bundle">
          <CodeBlock title="shell">{`git clone ${REPO_GIT} /opt/osmicmails
cd /opt/osmicmails/deploy/mailcow
cp osmicmails.env.example .env && chmod 600 .env`}</CodeBlock>
        </Step>

        <Step title="Configure .env" id="manual-env">
          <P>
            Set <C>APP_URL</C>, a <C>SESSION_SECRET</C> from <C>openssl rand -hex 32</C>, and{' '}
            <C>MAIL_TLS_SERVERNAME</C> to your <C>MAILCOW_HOSTNAME</C>. If you changed{' '}
            <C>COMPOSE_PROJECT_NAME</C> in <C>mailcow.conf</C>, add{' '}
            <C>MAILCOW_NETWORK=&lt;name&gt;_mailcow-network</C>.
          </P>
          <CodeBlock title="deploy/mailcow/.env">{MAILCOW_ENV_EXAMPLE}</CodeBlock>
        </Step>

        <Step title="Start OsmicMails" id="manual-start">
          <CodeBlock title="shell">{`docker compose pull      # or: docker compose build
docker compose up -d
docker compose ps         # wait for "healthy"`}</CodeBlock>
          <P>The Compose file it uses:</P>
          <CodeBlock title="deploy/mailcow/docker-compose.yml">{MAILCOW_COMPOSE}</CodeBlock>
        </Step>

        <Step title="Add the hostname to Mailcow's certificate" id="manual-cert">
          <P>
            In <C>/opt/mailcow-dockerized/mailcow.conf</C>, append the webmail name to{' '}
            <C>ADDITIONAL_SAN</C> (comma-separated), then let Mailcow request the certificate:
          </P>
          <CodeBlock title="mailcow.conf">{`ADDITIONAL_SAN=webmail.example.com`}</CodeBlock>
          <CodeBlock title="shell">{`cd /opt/mailcow-dockerized
docker compose up -d
docker compose logs -f acme-mailcow   # wait until the new certificate is deployed`}</CodeBlock>
          <Callout type="warning">
            <p>
              Do not add the name to <C>ADDITIONAL_SERVER_NAMES</C>. That makes Mailcow serve its
              own UI on the name instead of OsmicMails.
            </p>
          </Callout>
        </Step>

        <Step title="Serve it through nginx-mailcow" id="manual-nginx">
          <P>
            Create <C>data/conf/nginx/osmicmails.conf</C> in the Mailcow folder. Mailcow keeps files
            in this folder across updates.
          </P>
          <CodeBlock title="/opt/mailcow-dockerized/data/conf/nginx/osmicmails.conf">
            {renderTemplate(NGINX_SITE_TEMPLATE)}
          </CodeBlock>
          <P>
            The upstream is resolved at request time through Docker&apos;s DNS (<C>127.0.0.11</C>),
            so <C>nginx-mailcow</C> — and with it Mailcow&apos;s UI, SOGo and autodiscover — still
            starts while OsmicMails is stopped.
          </P>
        </Step>

        <Step title="Redirect SOGo's webmail (optional)" id="manual-sogo">
          <CodeBlock title="/opt/mailcow-dockerized/data/conf/nginx/site.osmicmails.custom">
            {renderTemplate(SOGO_REDIRECT_TEMPLATE)}
          </CodeBlock>
        </Step>

        <Step title="Test and restart nginx" id="manual-reload">
          <CodeBlock title="shell">{`cd /opt/mailcow-dockerized
docker compose exec nginx-mailcow nginx -t
docker compose restart nginx-mailcow`}</CodeBlock>
        </Step>
      </Steps>

      <H2 id="replace-sogo">Replacing SOGo</H2>
      <P>Choose how far to go. All three are reversible.</P>
      <Table
        head={['Option', 'What users see', 'Keeps']}
        rows={[
          [
            'Redirect (recommended)',
            'The “Webmail” links and /SOGo open OsmicMails',
            'SOGo calendars, contacts (CalDAV/CardDAV), ActiveSync',
          ],
          ['Side by side', 'OsmicMails on its own name, SOGo unchanged', 'Everything'],
          [
            'Remove SOGo',
            'Only OsmicMails',
            'Nothing from SOGo — calendars, contacts, ActiveSync stop',
          ],
        ]}
      />
      <H3 id="redirect">Redirect</H3>
      <P>
        The <C>site.osmicmails.custom</C> file above uses exact-match locations, which nginx prefers
        over Mailcow&apos;s <C>/SOGo</C> prefix block. Only the entry URLs are redirected; deep
        links such as <C>/SOGo/dav/…</C> and <C>/Microsoft-Server-ActiveSync</C> are untouched.
        Delete the file and restart <C>nginx-mailcow</C> to undo it.
      </P>
      <H3 id="remove-sogo">Remove SOGo completely</H3>
      <P>
        If nobody uses SOGo&apos;s calendars, address books or Exchange ActiveSync, you can stop it
        and free its memory. In <C>mailcow.conf</C>:
      </P>
      <CodeBlock title="mailcow.conf">{`SKIP_SOGO=y`}</CodeBlock>
      <CodeBlock title="shell">{`cd /opt/mailcow-dockerized && docker compose up -d`}</CodeBlock>
      <Callout type="warning" title="Check before removing SOGo">
        <p>
          Phones set up with ActiveSync (“Exchange”) accounts and calendar/contact sync stop
          working. Mail apps using IMAP/SMTP are not affected. Existing SOGo vacation messages and
          filters are Sieve scripts: OsmicMails keeps the active one running when you enable
          forwarding.
        </p>
      </Callout>
      <H3 id="app-links">Mailcow UI links</H3>
      <P>
        In the Mailcow admin UI,{' '}
        <strong className="text-fg">
          System → Configuration → Options → Customize → App links
        </strong>
        , add a link named “Webmail” to <C>https://webmail.example.com</C> so users find it from
        Mailcow&apos;s login page.
      </P>

      <H2 id="tls-servername">How TLS is verified on the internal network</H2>
      <P>
        Inside Docker, OsmicMails connects to <C>dovecot-mailcow</C> and <C>postfix-mailcow</C>.
        Those names are not on Mailcow&apos;s certificate, which is issued for{' '}
        <C>MAILCOW_HOSTNAME</C>. Rather than turning verification off, <C>MAIL_TLS_SERVERNAME</C>{' '}
        tells OsmicMails which name the certificate must match:
      </P>
      <CodeBlock title=".env">{`MAIL_IMAP_HOST=dovecot-mailcow
MAIL_SMTP_HOST=postfix-mailcow
MAIL_SIEVE_HOST=dovecot-mailcow
MAIL_TLS_SERVERNAME=mail.example.com   # your MAILCOW_HOSTNAME
MAIL_TLS_REJECT_UNAUTHORIZED=true`}</CodeBlock>
      <P>
        The connection is still fully encrypted and authenticated; a container impersonating Dovecot
        on the network would not have Mailcow&apos;s private key. Never set{' '}
        <C>MAIL_TLS_REJECT_UNAUTHORIZED=false</C> on a real server.
      </P>

      <H2 id="behind-proxy">Mailcow behind another reverse proxy</H2>
      <P>
        If Mailcow runs behind your own proxy (you changed <C>HTTP_BIND</C>/<C>HTTPS_BIND</C> and
        terminate TLS elsewhere), skip the nginx-mailcow steps. Point your proxy at the
        container&apos;s loopback port instead — <C>127.0.0.1:3004</C> by default, configurable with{' '}
        <C>OSMICMAILS_BIND</C> — using the examples in{' '}
        <A href="/docs/reverse-proxy">Reverse proxy &amp; HTTPS</A>. Running the installer with{' '}
        <C>--keep-sogo</C> and then deleting <C>data/conf/nginx/osmicmails.conf</C> gives you the
        container without the nginx part.
      </P>

      <H2 id="other-host">OsmicMails on a different server</H2>
      <P>
        To run OsmicMails away from the Mailcow host, use the public hostname for IMAP, SMTP and
        Sieve and follow <A href="/docs/docker">Standalone Docker</A>. Mailcow&apos;s ports 993, 587
        and 4190 must be reachable from that server. Add its IP to Mailcow&apos;s Fail2ban
        allow-list (
        <strong className="text-fg">System → Configuration → Fail2ban parameters</strong>): all
        webmail users share that IP, so a few mistyped passwords could otherwise ban everyone.
      </P>

      <H2 id="mailcow-notes">Mailcow specifics</H2>
      <Table
        head={['Topic', 'Behaviour']}
        rows={[
          [
            'Domains',
            'One instance serves every domain and mailbox on the Mailcow server; users sign in with their full address.',
          ],
          [
            'Fail2ban / netfilter',
            'Mailcow never bans private addresses, so on the internal network OsmicMails’s own throttling (per IP and per account) is what stops password guessing. Keep TRUST_PROXY_HOPS correct.',
          ],
          [
            'Passwords & 2FA',
            'Mailcow’s TOTP/WebAuthn protects the Mailcow UI, not IMAP. Users with app passwords can sign in with one.',
          ],
          [
            'Message size',
            'Keep MAX_ATTACHMENT_SIZE_MB and MAX_MESSAGE_SIZE_MB below Mailcow’s message size limit (default 100 MB).',
          ],
          [
            'Forwarding',
            'Saved as a Sieve script named osmicmails-forwarding. Mailcow’s global filters and the spam-to-Junk rule keep running.',
          ],
          [
            'Sent mail',
            'Postfix does not keep copies; OsmicMails saves each sent message to the Sent folder.',
          ],
          [
            'Connections',
            'Each signed-in mailbox uses up to IMAP_POOL_SIZE (3) connections plus one for IDLE — well within Dovecot’s per-user limit.',
          ],
        ]}
      />

      <H2 id="update">Updating and uninstalling</H2>
      <CodeBlock title="update">{`cd /opt/osmicmails && git pull
cd deploy/mailcow && ./install.sh --yes     # pulls the new image, keeps .env and data`}</CodeBlock>
      <CodeBlock title="uninstall">{`cd /opt/osmicmails/deploy/mailcow && ./install.sh --uninstall
# data is kept; to delete it as well:
docker volume rm osmicmails_osmicmails-data`}</CodeBlock>
      <P>
        Remove the name from <C>ADDITIONAL_SAN</C> afterwards if you no longer need it. Mailcow
        updates (<C>./update.sh</C>) do not affect OsmicMails; after one, check that{' '}
        <C>data/conf/nginx/osmicmails.conf</C> is still there.
      </P>
    </>
  );
}
