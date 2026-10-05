import {
  Rocket,
  Server,
  ShieldCheck,
  Settings2,
  Container,
  LifeBuoy,
  ArrowRight,
  ArrowDown,
} from 'lucide-react';
import {
  PageHeader,
  H2,
  P,
  UL,
  C,
  A,
  Callout,
  Card,
  Cards,
  Table,
} from '@/components/docs/primitives';

export default function Introduction() {
  return (
    <>
      <PageHeader eyebrow="Documentation" title="OsmicMails">
        A fast, secure, Gmail-style webmail for Mailcow. Run it next to your mail server and give
        your users a modern inbox in place of SOGo — with every mailbox on your domain available
        from one screen.
      </PageHeader>

      <Cards>
        <Card href="/docs/mailcow" title="Add it to Mailcow" icon={Server}>
          One installer on your Mailcow host. Uses Mailcow&apos;s nginx and certificate and replaces
          SOGo&apos;s webmail.
        </Card>
        <Card href="/docs/quick-start" title="Quick start" icon={Rocket}>
          Every way to run it — Mailcow add-on, standalone Docker, or from source.
        </Card>
      </Cards>

      <H2 id="how-it-works">How it works</H2>
      <P>
        OsmicMails is a client, not a mail server. Mailcow keeps doing everything it does today —
        storage, delivery, spam filtering, DKIM/SPF/DMARC, authentication. OsmicMails talks to it
        with the same protocols a desktop mail app uses, from your server, so the browser never
        connects to IMAP or SMTP itself.
      </P>
      <Architecture />
      <UL>
        <li>
          <strong className="text-fg">Sign-in</strong> checks the mailbox password against Dovecot.
          There are no separate user accounts to create; every mailbox on the Mailcow server can
          sign in.
        </li>
        <li>
          <strong className="text-fg">Mail</strong> is read over IMAPS (993) and sent through
          Postfix submission (587, STARTTLS). Sent copies are stored in the Sent folder.
        </li>
        <li>
          <strong className="text-fg">Forwarding</strong> is written as a Sieve script over
          ManageSieve (4190), so it keeps working while nobody is signed in.
        </li>
        <li>
          <strong className="text-fg">Live updates</strong> come from one IMAP IDLE connection per
          signed-in mailbox, fanned out to browser tabs with Server-Sent Events.
        </li>
      </UL>

      <H2 id="features">What users get</H2>
      <Table
        head={['Area', 'Highlights']}
        rows={[
          ['Mailboxes', 'Up to 10 mailboxes signed in at once (info@, sales@ …), switch instantly'],
          [
            'Inbox',
            'Conversations, stars, archive, bulk actions, drag to folders, keyboard shortcuts',
          ],
          ['Compose', 'Rich text, attachments, inline images, signatures, autosaved drafts'],
          ['Search', 'from:, to:, subject:, has:attachment, is:unread, after:, before:, in:'],
          ['Safety', 'Sanitized HTML in a sandboxed frame, remote images blocked until allowed'],
          ['Mobile', 'Responsive layout, installable as an app, no zoom-on-focus on iPhone'],
          ['Settings', 'Themes, density, notifications, forwarding, signatures, active sessions'],
        ]}
      />

      <H2 id="why-self-host">Why you run your own copy</H2>
      <P>
        Each organisation runs OsmicMails on its own infrastructure, connected to its own Mailcow.
        There is deliberately no shared service where users of different mail servers sign in:
      </P>
      <UL>
        <li>
          Mailbox passwords only ever reach a server you control. A webmail run by someone else
          would see every password typed into it.
        </li>
        <li>
          The mail server is fixed in configuration. Users cannot point the app at another host, so
          it cannot be abused to probe your network or harvest credentials for other servers.
        </li>
        <li>Your mail, sessions and logs stay on your hardware and under your retention rules.</li>
      </UL>
      <Callout type="security" title="Never sign in to a mailbox through someone else's webmail">
        <p>
          If you are evaluating OsmicMails, install it on your own server — it takes a few minutes.
          Do not ask users to enter their passwords on an instance operated by a third party.
        </p>
      </Callout>

      <H2 id="requirements">Requirements</H2>
      <UL>
        <li>
          Mailcow: dockerized (any recent version) — or any IMAP/SMTP server with IMAPS and
          submission.
        </li>
        <li>
          Docker Engine with the Compose plugin, or Node.js <C>20.11+</C>.
        </li>
        <li>
          A hostname for the webmail, e.g. <C>webmail.example.com</C>, pointing at the server.
        </li>
        <li>Some free memory for the container — the provided Compose files cap it at 768 MB.</li>
      </UL>

      <H2 id="next">Next steps</H2>
      <Cards>
        <Card href="/docs/docker" title="Standalone Docker" icon={Container}>
          OsmicMails on a separate host or in front of a non-Mailcow server.
        </Card>
        <Card href="/docs/configuration" title="Configuration" icon={Settings2}>
          All environment variables and their defaults.
        </Card>
        <Card href="/docs/security" title="Security" icon={ShieldCheck}>
          The protections built in, and a checklist for operators.
        </Card>
        <Card href="/docs/troubleshooting" title="Troubleshooting" icon={LifeBuoy}>
          Fixes for sign-in, certificate, proxy and delivery problems.
        </Card>
      </Cards>
      <P>
        OsmicMails is open source under the MIT licence. Source, issues and releases are on{' '}
        <A href="https://github.com/CraftedByAli/webmail">GitHub</A>.
      </P>
    </>
  );
}

function Box({ title, children, accent }) {
  return (
    <div
      className={
        accent
          ? 'border-accent/40 bg-accent-subtle rounded-surface border px-3.5 py-3'
          : 'border-line bg-surface rounded-surface border px-3.5 py-3'
      }
    >
      <p className="text-ui text-fg font-semibold">{title}</p>
      <p className="text-caption text-fg-secondary mt-0.5">{children}</p>
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div className="text-fg-muted flex flex-col items-center justify-center gap-0.5 px-1 py-1 md:py-0">
      <span className="text-meta font-mono whitespace-nowrap">{label}</span>
      <ArrowRight className="hidden size-4 md:block" aria-hidden="true" />
      <ArrowDown className="size-4 md:hidden" aria-hidden="true" />
    </div>
  );
}

function Architecture() {
  return (
    <figure className="border-line bg-sunken rounded-surface my-6 border p-4">
      <div className="grid items-center gap-1 md:grid-cols-[1fr_auto_1fr_auto_1.2fr]">
        <Box title="Browser">Desktop, tablet or phone</Box>
        <Arrow label="HTTPS" />
        <Box title="OsmicMails" accent>
          Next.js server · sessions · sanitizer
        </Box>
        <Arrow label="TLS" />
        <div className="grid gap-1.5">
          <Box title="Dovecot">IMAPS 993 · Sieve 4190</Box>
          <Box title="Postfix">Submission 587</Box>
        </div>
      </div>
      <figcaption className="text-caption text-fg-muted mt-3">
        On a Mailcow host all mail traffic stays on the internal Docker network.
      </figcaption>
    </figure>
  );
}
