import { PageHeader, H2, P, UL, C, A } from '@/components/docs/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import { ISSUES_URL } from '@/components/docs/site';

function Problem({ id, title, children }) {
  return (
    <>
      <H2 id={id}>{title}</H2>
      {children}
    </>
  );
}

export default function Troubleshooting() {
  return (
    <>
      <PageHeader eyebrow="Reference" title="Troubleshooting">
        Start with the logs — <C>docker logs osmicmails-mailcow</C> (or <C>osmicmails</C>) — and{' '}
        <C>/api/ready</C>, which names the check that fails.
      </PageHeader>

      <Problem id="login-fails" title="“Incorrect email or password” with the right password">
        <UL>
          <li>
            Test the same credentials from the server:{' '}
            <C>MAIL_USER=… MAIL_PASS=… npm run check:mailcow</C> in a source checkout.
          </li>
          <li>Users must sign in with the full address, not just the local part.</li>
          <li>
            If the mailbox has an app password configured and IMAP login with the main password is
            disabled in Mailcow, use the app password.
          </li>
          <li>
            Check that the mailbox has IMAP and SMTP access enabled in Mailcow (mailbox → protocol
            access).
          </li>
        </UL>
      </Problem>

      <Problem
        id="certificate"
        title="Certificate or TLS errors when connecting to the mail server"
      >
        <P>
          Logs show <C>Hostname/IP does not match certificate&apos;s altnames</C> or{' '}
          <C>unable to verify the first certificate</C>.
        </P>
        <UL>
          <li>
            Using internal names (<C>dovecot-mailcow</C>)? Set <C>MAIL_TLS_SERVERNAME</C> to your{' '}
            <C>MAILCOW_HOSTNAME</C>.
          </li>
          <li>
            Using the public name? It must be on Mailcow&apos;s certificate — check{' '}
            <C>openssl s_client -connect mail.example.com:993 -servername mail.example.com</C>.
          </li>
          <li>
            Self-signed Mailcow certificate (ACME disabled)? Get a real one; disabling verification
            exposes every password.
          </li>
        </UL>
      </Problem>

      <Problem id="502" title="502 Bad Gateway from nginx-mailcow">
        <UL>
          <li>
            Is the container healthy? <C>docker ps --filter name=osmicmails-mailcow</C>
          </li>
          <li>
            Is it on Mailcow&apos;s network?{' '}
            <C>docker network inspect mailcowdockerized_mailcow-network | grep osmicmails</C>. If
            you changed <C>COMPOSE_PROJECT_NAME</C>, set <C>MAILCOW_NETWORK</C> in{' '}
            <C>deploy/mailcow/.env</C> and run <C>docker compose up -d</C>.
          </li>
        </UL>
      </Problem>

      <Problem id="cert-warning" title="Browser warns about the webmail certificate">
        <P>
          The webmail hostname is not on Mailcow&apos;s certificate yet. Check that it is in{' '}
          <C>ADDITIONAL_SAN</C>, that DNS points at the server, and read{' '}
          <C>docker compose logs acme-mailcow</C> in the Mailcow folder. Let&apos;s Encrypt must
          reach the server on port 80.
        </P>
      </Problem>

      <Problem id="redirect-loop" title="Too many redirects">
        <P>
          Usually TLS is terminated by another proxy in front of Mailcow, so nginx-mailcow sees
          plain HTTP and redirects forever. Point that outer proxy at OsmicMails directly (
          <C>127.0.0.1:3004</C>) as described in{' '}
          <A href="/docs/mailcow#behind-proxy">Mailcow behind another reverse proxy</A>, and make
          sure it sends <C>X-Forwarded-Proto: https</C>.
        </P>
      </Problem>

      <Problem id="throttled" title="Everyone gets “Too many requests”">
        <P>
          All users appear to share one IP, so <C>TRUST_PROXY_HOPS</C> is too low for your proxy
          chain — typically Cloudflare in front of nginx needs <C>2</C>. Compare the addresses in
          Settings → Security with your users&apos; real IPs.
        </P>
      </Problem>

      <Problem id="realtime" title="New mail only appears after a while">
        <P>
          A Wi-Fi-off icon in the top bar means live updates fell back to polling. A proxy is
          buffering <C>/api/realtime</C>: disable buffering for that path (see{' '}
          <A href="/docs/reverse-proxy">Reverse proxy</A>). Also check that the mail server allows
          IMAP IDLE.
        </P>
      </Problem>

      <Problem id="uploads" title="Attachments fail to upload">
        <UL>
          <li>
            <C>413</C> in the browser: raise the proxy body limit (<C>client_max_body_size</C>)
            above <C>MAX_ATTACHMENT_SIZE_MB</C>.
          </li>
          <li>
            Sending fails for large messages: keep <C>MAX_MESSAGE_SIZE_MB</C> below Mailcow&apos;s
            message size limit.
          </li>
        </UL>
      </Problem>

      <Problem id="forwarding" title="Forwarding cannot be saved">
        <UL>
          <li>
            ManageSieve must be reachable on <C>MAIL_SIEVE_HOST</C>:<C>MAIL_SIEVE_PORT</C> (4190).
          </li>
          <li>
            The destination domain may be blocked by <C>MAIL_FORWARDING_ALLOWED_DOMAINS</C>.
          </li>
          <li>Forwarding to the mailbox itself is refused to prevent loops.</li>
        </UL>
      </Problem>

      <Problem id="iphone" title="The page zooms in when tapping a field on iPhone">
        <P>
          Fixed in current versions: form fields use 16 px text on touch screens, which stops iOS
          Safari from zooming. Update your instance, and remove any custom CSS that shrinks inputs.
        </P>
      </Problem>

      <Problem id="help" title="Still stuck?">
        <P>
          Open an issue on <A href={ISSUES_URL}>GitHub</A> with the version (Settings → About), your
          setup (Mailcow add-on, Docker, source) and the relevant log lines. Remove addresses and
          hostnames you do not want to publish.
        </P>
        <CodeBlock title="collect logs">{`docker logs --since 30m osmicmails-mailcow 2>&1 | tail -200`}</CodeBlock>
      </Problem>
    </>
  );
}
