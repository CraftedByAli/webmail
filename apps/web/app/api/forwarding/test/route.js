import { createHandler, json } from '@/lib/api/handler';
import { errors } from '@/lib/api/errors';
import { getProvider } from '@/lib/mail';
import { escapeHtml } from '@/lib/mime/structure';

/**
 * POST /api/forwarding/test — sends a short message from the active mailbox
 * to itself. It travels through the mail server like any other message, so
 * it is forwarded exactly as real mail would be.
 */
export const POST = createHandler(async ({ session }) => {
  const provider = await getProvider(session);
  const forwarding = await provider.getForwarding();
  if (!forwarding.enabled) throw errors.badRequest('Turn forwarding on before sending a test.');
  const when = new Date().toUTCString();
  const list = forwarding.addresses.map(escapeHtml).join(', ');
  await provider.sendMessage(
    {
      to: [{ name: '', address: session.email }],
      cc: [],
      bcc: [],
      subject: `OsmicMails forwarding test (${when})`,
      html: `<p>This is a test of mail forwarding for <b>${escapeHtml(session.email)}</b>.</p><p>If forwarding works, a copy of this message also arrives at: ${list}.</p><p>Sent ${escapeHtml(when)}.</p>`,
      attachments: [],
      references: [],
      priority: 'normal',
    },
    { sessionId: session.id }
  );
  return json({ ok: true, sentTo: session.email, forwardedTo: forwarding.addresses });
});
