import { PageHeader, H2, P, UL, C, A, Callout, Table } from '@/components/docs/primitives';
import { CodeBlock } from '@/components/docs/code-block';

export default function ReverseProxy() {
  return (
    <>
      <PageHeader eyebrow="Integrate" title="Reverse proxy & HTTPS">
        OsmicMails listens on plain HTTP and expects a reverse proxy to terminate TLS. On a Mailcow
        host, <A href="/docs/mailcow">Mailcow&apos;s nginx does this for you</A>; everywhere else,
        use one of the configurations below.
      </PageHeader>

      <H2 id="requirements">What the proxy must do</H2>
      <Table
        head={['Requirement', 'Why']}
        rows={[
          [
            'Serve HTTPS only, redirect HTTP',
            'Session cookies are Secure; passwords must never travel in clear',
          ],
          [
            'Pass Host and X-Forwarded-Proto',
            'Origin checks (CSRF) and HTTPS redirects rely on them',
          ],
          [
            'Append the client to X-Forwarded-For',
            'Login throttling is per client IP; see TRUST_PROXY_HOPS below',
          ],
          ['Do not buffer /api/realtime', 'It is a Server-Sent Events stream for live updates'],
          [
            'Allow request bodies of 64 MB',
            'Attachment uploads (MAX_ATTACHMENT_SIZE_MB plus overhead)',
          ],
          ['Keep port 3000 private', 'Bind it to 127.0.0.1 or a private network; never publish it'],
        ]}
      />

      <H2 id="client-ip">Client IP and TRUST_PROXY_HOPS</H2>
      <P>
        Each proxy appends the address it received a connection from to <C>X-Forwarded-For</C>.
        Anything to the left of that may have been written by the client. OsmicMails therefore reads
        the client IP <C>TRUST_PROXY_HOPS</C> entries from the right:
      </P>
      <Table
        head={['Chain in front of OsmicMails', 'TRUST_PROXY_HOPS', 'TRUST_CLOUDFLARE']}
        rows={[
          ['Nginx, Caddy, Traefik or nginx-mailcow', '1', 'false'],
          ['Cloudflare → Nginx/Caddy', '2', 'false, or true (see below)'],
          ['Load balancer → Nginx', '2', 'false'],
          ['Nothing (direct, testing only)', '0', 'false'],
        ]}
      />
      <Callout type="security" title="Getting this wrong">
        <p>
          Too low and every user appears to come from your proxy, so one person mistyping a password
          can throttle everyone. Too high and clients can choose their own IP and dodge login
          throttling. After changing it, check the addresses under{' '}
          <strong>Settings → Security</strong> (active sessions and login history).
        </p>
      </Callout>

      <H2 id="nginx">Nginx</H2>
      <CodeBlock title="/etc/nginx/sites-available/osmicmails.conf">{`server {
    listen 80;
    listen [::]:80;
    server_name webmail.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name webmail.example.com;

    ssl_certificate     /etc/letsencrypt/live/webmail.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webmail.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 120s;
    }

    location = /api/realtime {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
}`}</CodeBlock>
      <CodeBlock title="shell">{`sudo ln -s /etc/nginx/sites-available/osmicmails.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d webmail.example.com
sudo nginx -t && sudo systemctl reload nginx`}</CodeBlock>
      <P>
        OsmicMails sets its own Content-Security-Policy, HSTS and other security headers; do not add
        conflicting ones in the proxy.
      </P>

      <H2 id="caddy">Caddy</H2>
      <P>Caddy obtains and renews the certificate itself.</P>
      <CodeBlock title="/etc/caddy/Caddyfile">{`webmail.example.com {
    request_body {
        max_size 64MB
    }
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
}`}</CodeBlock>

      <H2 id="traefik">Traefik</H2>
      <P>
        Labels for the OsmicMails service, with a Let&apos;s Encrypt resolver named <C>le</C>:
      </P>
      <CodeBlock title="docker-compose.yml (excerpt)">{`services:
  osmicmails:
    # … as in the Standalone Docker guide, without "ports:" …
    networks: [traefik]
    labels:
      - traefik.enable=true
      - traefik.http.routers.osmicmails.rule=Host(\`webmail.example.com\`)
      - traefik.http.routers.osmicmails.entrypoints=websecure
      - traefik.http.routers.osmicmails.tls.certresolver=le
      - traefik.http.services.osmicmails.loadbalancer.server.port=3000`}</CodeBlock>
      <P>
        If you use a buffering or compression middleware, exclude <C>/api/realtime</C> from it.
      </P>

      <H2 id="cloudflare">Cloudflare</H2>
      <UL>
        <li>
          SSL/TLS mode <strong className="text-fg">Full (strict)</strong>, with a valid certificate
          on your origin proxy.
        </li>
        <li>
          Turn off Rocket Loader and Email Address Obfuscation — they inject scripts that the
          Content-Security-Policy blocks.
        </li>
        <li>
          Bypass the cache for <C>/api/*</C> (responses are already <C>no-store</C>).
        </li>
        <li>
          Set <C>TRUST_PROXY_HOPS=2</C>. Alternatively set <C>TRUST_CLOUDFLARE=true</C> to use{' '}
          <C>CF-Connecting-IP</C> — but only if your origin firewall accepts connections from{' '}
          <A href="https://www.cloudflare.com/ips/">Cloudflare&apos;s IP ranges</A> alone, otherwise
          anyone can send that header.
        </li>
        <li>
          Live updates work through Cloudflare; the browser reconnects automatically when Cloudflare
          closes a long-lived stream.
        </li>
      </UL>
    </>
  );
}
