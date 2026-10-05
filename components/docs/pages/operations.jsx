import { PageHeader, H2, H3, P, UL, C, A, Callout, Table } from '@/components/docs/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import { IMAGE } from '@/components/docs/site';

export default function Operations() {
  return (
    <>
      <PageHeader eyebrow="Reference" title="Updates, backups & monitoring">
        Day-two work for a production instance. Mail itself lives on your mail server; OsmicMails
        only keeps sessions, preferences, signatures and contacts.
      </PageHeader>

      <H2 id="updates">Updating</H2>
      <P>
        Releases are published as <C>{IMAGE}:&lt;version&gt;</C>, with <C>latest</C> pointing at the
        newest one. Sessions survive updates as long as <C>SESSION_SECRET</C> and the data volume
        stay the same.
      </P>
      <H3 id="update-mailcow">Mailcow add-on</H3>
      <CodeBlock title="shell">{`cd /opt/osmicmails && git pull
cd deploy/mailcow && ./install.sh --yes`}</CodeBlock>
      <H3 id="update-docker">Standalone Docker</H3>
      <CodeBlock title="shell">{`cd /opt/osmicmails
docker compose pull && docker compose up -d
docker image prune -f`}</CodeBlock>
      <Callout type="tip" title="Roll back">
        <p>
          Set the previous version tag (<C>OSMICMAILS_VERSION</C> or <C>OSMICMAILS_IMAGE</C>) and
          run <C>docker compose up -d</C> again. Watch the release notes for the rare release that
          changes stored data.
        </p>
      </Callout>

      <H2 id="backups">Backups</H2>
      <P>Back up two things:</P>
      <UL>
        <li>
          <strong className="text-fg">The .env file</strong> — above all <C>SESSION_SECRET</C>.
          Without it, stored sessions cannot be decrypted (users simply sign in again).
        </li>
        <li>
          <strong className="text-fg">The data volume</strong> — a SQLite database in WAL mode. Stop
          the container for a consistent copy; it takes seconds.
        </li>
      </UL>
      <CodeBlock title="backup">{`docker stop osmicmails-mailcow        # standalone: osmicmails
docker run --rm -v osmicmails_osmicmails-data:/data:ro -v "$PWD":/backup alpine \\
  tar czf /backup/osmicmails-$(date +%F).tgz -C /data .
docker start osmicmails-mailcow`}</CodeBlock>
      <CodeBlock title="restore">{`docker stop osmicmails-mailcow
docker run --rm -v osmicmails_osmicmails-data:/data -v "$PWD":/backup alpine \\
  sh -c 'rm -rf /data/* && tar xzf /backup/osmicmails-2026-01-31.tgz -C /data'
docker start osmicmails-mailcow`}</CodeBlock>
      <P>
        Run <C>docker volume ls</C> to find the volume name; it is prefixed with the Compose project
        name. Backups contain encrypted credentials and contact data — store them encrypted.
      </P>

      <H2 id="monitoring">Monitoring</H2>
      <Table
        head={['Check', 'Meaning']}
        rows={[
          [
            <C key="h">GET /api/health</C>,
            '200 while the process is up. Used by the Docker health check.',
          ],
          [
            <C key="r">GET /api/ready</C>,
            '200 when the database is writable and IMAP/SMTP are reachable; 503 with the failing check otherwise.',
          ],
          [
            <C key="d">/admin/diagnostics</C>,
            'For ADMIN_EMAILS: versions, limits, server capabilities and connection status.',
          ],
        ]}
      />
      <P>Logs are JSON lines on stdout. Useful alerts:</P>
      <UL>
        <li>
          <C>level</C> ≥ 50 (errors).
        </li>
        <li>
          Spikes of <C>&quot;operation&quot;:&quot;auth.login&quot;</C> with{' '}
          <C>&quot;success&quot;:false</C> — password guessing.
        </li>
        <li>
          <C>&quot;slow operation&quot;</C> — the mail server is struggling.
        </li>
      </UL>
      <CodeBlock title="shell">{`docker logs -f --since 1h osmicmails-mailcow`}</CodeBlock>

      <H2 id="scaling">Scaling</H2>
      <P>
        Run one instance per mail server. Sessions live in SQLite and live updates are fanned out
        in-process, so several replicas behind a load balancer are not supported. Give a busy
        instance more memory and raise <C>IMAP_POOL_SIZE</C> only if the mail server allows the
        extra connections.
      </P>

      <H2 id="without-docker">Without Docker (systemd)</H2>
      <CodeBlock title="/etc/systemd/system/osmicmails.service">{`[Unit]
Description=OsmicMails
After=network.target

[Service]
User=osmicmails
WorkingDirectory=/opt/osmicmails
EnvironmentFile=/opt/osmicmails/.env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/osmicmails/data

[Install]
WantedBy=multi-user.target`}</CodeBlock>
      <P>
        After each <C>npm run build</C>, copy <C>.next/static</C> to{' '}
        <C>.next/standalone/.next/static</C> and <C>public</C> to <C>.next/standalone/public</C>.
        Point <C>DATABASE_PATH</C> and <C>UPLOAD_DIR</C> into <C>/opt/osmicmails/data</C>. See{' '}
        <A href="/docs/reverse-proxy">Reverse proxy &amp; HTTPS</A> for the web server in front.
      </P>
    </>
  );
}
