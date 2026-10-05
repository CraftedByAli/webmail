#!/usr/bin/env node
/**
 * Connectivity check against a real Mailcow server using the configured
 * environment. Verifies IMAP login + folder listing and SMTP authentication.
 *
 *   MAIL_USER=you@example.com MAIL_PASS='secret' node scripts/check-mailcow.js
 *
 * Reads MAIL_IMAP_* / MAIL_SMTP_* from the environment (or .env via `node --env-file=.env`).
 */
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

const user = process.env.MAIL_USER;
const pass = process.env.MAIL_PASS;
if (!user || !pass) {
  console.error('Set MAIL_USER and MAIL_PASS');
  process.exit(2);
}
const bool = (v, d) =>
  v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase());
const imapHost = process.env.MAIL_IMAP_HOST;
const imapPort = Number(process.env.MAIL_IMAP_PORT || 993);
const imapTls = bool(process.env.MAIL_IMAP_TLS, true);
const smtpHost = process.env.MAIL_SMTP_HOST;
const smtpPort = Number(process.env.MAIL_SMTP_PORT || 587);
const smtpSecure = bool(process.env.MAIL_SMTP_SECURE, false);
const rejectUnauthorized = bool(process.env.MAIL_TLS_REJECT_UNAUTHORIZED, true);
// Internal hosts (dovecot-mailcow) still verify the public certificate name.
const servername = process.env.MAIL_TLS_SERVERNAME || undefined;

let failed = false;

console.log(`IMAP ${imapHost}:${imapPort} (${imapTls ? 'IMAPS' : 'STARTTLS'}) as ${user}`);
const started = Date.now();
const client = new ImapFlow({
  host: imapHost,
  port: imapPort,
  secure: imapTls,
  servername,
  auth: { user, pass },
  logger: false,
  tls: { rejectUnauthorized },
});
try {
  await client.connect();
  console.log(`  ✓ authenticated in ${Date.now() - started}ms`);
  const caps = [...client.capabilities.keys()];
  console.log(
    `  capabilities: ${caps.filter((c) => /THREAD|IDLE|MOVE|UIDPLUS|ESEARCH|SPECIAL-USE|CONDSTORE/.test(c)).join(', ')}`
  );
  const list = await client.list({ statusQuery: { messages: true, unseen: true } });
  for (const f of list)
    console.log(
      `  - ${f.path}${f.specialUse ? ` [${f.specialUse}]` : ''} (${f.status?.messages ?? '?'} messages, ${f.status?.unseen ?? '?'} unread)`
    );
  await client.logout();
} catch (error) {
  failed = true;
  console.error(`  ✗ IMAP failed: ${error.responseText || error.message}`);
}

console.log(`SMTP ${smtpHost}:${smtpPort} (${smtpSecure ? 'TLS' : 'STARTTLS'})`);
const transport = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  servername,
  requireTLS: !smtpSecure,
  auth: { user, pass },
  tls: { rejectUnauthorized },
});
try {
  const t = Date.now();
  await transport.verify();
  console.log(`  ✓ authenticated in ${Date.now() - t}ms`);
} catch (error) {
  failed = true;
  console.error(`  ✗ SMTP failed: ${error.response || error.message}`);
} finally {
  transport.close();
}

process.exit(failed ? 1 : 0);
