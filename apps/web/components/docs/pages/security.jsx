import { PageHeader, H2, P, UL, C, A, Callout, Table } from '@/components/docs/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import { IMAGE, SECURITY_URL } from '@/components/docs/site';

export default function Security() {
  return (
    <>
      <PageHeader eyebrow="Reference" title="Security">
        A webmail sees every password and renders hostile content all day. This page covers what
        OsmicMails does to stay safe, and what you need to do as the operator.
      </PageHeader>

      <H2 id="built-in">Built-in protections</H2>
      <Table
        head={['Threat', 'Protection']}
        rows={[
          [
            'Password theft',
            'Passwords travel once, over HTTPS, and are never sent back to the browser. On the server they are encrypted with AES-256-GCM under a key derived from SESSION_SECRET and the session cookie — the database alone is useless.',
          ],
          [
            'Malicious email (XSS)',
            'HTML is sanitized on the server against an allow-list, then shown in a sandboxed, scriptless iframe with its own Content-Security-Policy.',
          ],
          [
            'Tracking',
            'Remote images and CSS are blocked until the user allows them; tracking pixels are removed.',
          ],
          [
            'CSRF & clickjacking',
            'SameSite cookies, a required custom header on every change, Origin checks, frame-ancestors none.',
          ],
          [
            'Password guessing',
            'Throttling per client IP and per mailbox. The client IP cannot be spoofed through X-Forwarded-For (TRUST_PROXY_HOPS).',
          ],
          [
            'Dangerous attachments',
            'File types are detected from content, executables are refused, downloads are never rendered as HTML.',
          ],
          [
            'Server misuse (SSRF)',
            'Mail servers come from configuration only. Users cannot point the app at other hosts, and it never fetches URLs found in email.',
          ],
          [
            'Stolen sessions',
            'HttpOnly, Secure cookies; active-session list; revoke one session or sign out everywhere.',
          ],
          ['Leaky logs', 'Passwords, tokens and cookies are redacted; users see generic errors.'],
        ]}
      />

      <H2 id="checklist">Operator checklist</H2>
      <UL>
        <li>
          <strong className="text-fg">HTTPS only.</strong> Serve OsmicMails over HTTPS with HTTP
          redirected. Never publish port 3000 to the internet.
        </li>
        <li>
          <strong className="text-fg">Strong, stable secret.</strong> Generate <C>SESSION_SECRET</C>{' '}
          with <C>openssl rand -hex 32</C>, keep <C>.env</C> at mode <C>600</C>, and back it up with
          the same care as a private key.
        </li>
        <li>
          <strong className="text-fg">Keep TLS verification on.</strong> Use{' '}
          <C>MAIL_TLS_SERVERNAME</C> for internal hostnames; never set{' '}
          <C>MAIL_TLS_REJECT_UNAUTHORIZED=false</C> in production.
        </li>
        <li>
          <strong className="text-fg">Set TRUST_PROXY_HOPS to match your proxies</strong>, and
          enable <C>TRUST_CLOUDFLARE</C> only when the origin is firewalled to Cloudflare.
        </li>
        <li>
          <strong className="text-fg">Limit admins.</strong> Only list mailboxes that need
          diagnostics in <C>ADMIN_EMAILS</C>.
        </li>
        <li>
          <strong className="text-fg">Decide on forwarding.</strong> Restrict destinations with{' '}
          <C>MAIL_FORWARDING_ALLOWED_DOMAINS</C>, or disable it with{' '}
          <C>MAIL_FORWARDING_ENABLED=false</C>, if mail must stay in-house.
        </li>
        <li>
          <strong className="text-fg">Update regularly</strong> and pin released versions rather
          than building from untrusted forks.
        </li>
        <li>
          <strong className="text-fg">Watch the logs</strong> for bursts of failed sign-ins (
          <C>&quot;operation&quot;:&quot;auth.login&quot;,&quot;success&quot;:false</C>).
        </li>
      </UL>

      <H2 id="verify-image">Verify the image you run</H2>
      <P>
        Release images are built by GitHub Actions from the public repository and carry signed build
        provenance and an SBOM. With the GitHub CLI:
      </P>
      <CodeBlock title="shell">{`gh attestation verify oci://${IMAGE}:<version> --owner CraftedByAli`}</CodeBlock>

      <H2 id="csp">Content-Security-Policy</H2>
      <P>
        Every page gets a fresh nonce. Scripts run only from the app itself; email content runs no
        scripts at all. <C>img-src https:</C> exists so users can choose to load remote images.
        Proxies and CDNs that inject scripts (Cloudflare Rocket Loader, analytics snippets) are
        blocked by design.
      </P>

      <H2 id="shared-hosting">Why there is no shared OsmicMails service</H2>
      <P>
        A public webmail that accepts any mail server would receive the passwords of everyone who
        signs in, and could be turned into a tool for probing networks. OsmicMails is built so that
        each organisation runs its own copy, tied to its own mail server in configuration. If
        someone offers to host it for you, they will hold your users&apos; passwords.
      </P>

      <H2 id="report">Reporting a vulnerability</H2>
      <Callout type="security">
        <p>
          Please report privately through <A href={SECURITY_URL}>GitHub security advisories</A>{' '}
          rather than a public issue. Reports are acknowledged within 3 working days.
        </p>
      </Callout>
    </>
  );
}
