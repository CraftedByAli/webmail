import { createHandler, json, readJson } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { addressList, str, folderPath, int } from '@/lib/api/validate';
import { getPreferences } from '@/lib/preferences/repository';
import { errors } from '@/lib/api/errors';

/**
 * POST /api/mail/send
 * Body: { to, cc, bcc, subject, html, text, attachments, inReplyTo, references, inReplyToRef, draftUid, priority }
 */
export const POST = createHandler(
  async ({ session, request }) => {
    const body = await readJson(request, 6 * 1024 * 1024);
    const payload = parseComposePayload(body);
    const prefs = getPreferences(session.email);
    const provider = await getProvider(session);
    const result = await provider.sendMessage(payload, {
      sessionId: session.id,
      fromName: prefs.general.displayName,
    });
    return json({ ok: true, ...result });
  },
  { rateLimit: 'send' }
);

/**
 * Validates the compose payload shared by send and draft routes.
 * @param {any} body
 */
export function parseComposePayload(body) {
  const to = addressList(body.to, { name: 'To' });
  const cc = addressList(body.cc, { name: 'Cc' });
  const bcc = addressList(body.bcc, { name: 'Bcc' });
  const subject = str(body.subject, { name: 'subject', max: 998 });
  const html = str(body.html, { name: 'body', max: 4 * 1024 * 1024 });
  const text = str(body.text, { name: 'body', max: 2 * 1024 * 1024 });
  const inReplyTo =
    str(body.inReplyTo, { name: 'inReplyTo', max: 998 }).replace(/[<>\s]/g, '') || undefined;
  const references = Array.isArray(body.references)
    ? body.references
        .slice(0, 50)
        .map((r) => String(r).replace(/[<>\s]/g, ''))
        .filter(Boolean)
    : [];
  const priority = ['high', 'normal', 'low'].includes(body.priority) ? body.priority : 'normal';
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.slice(0, 50).map(parseAttachmentRef)
    : [];
  const draftUid = body.draftUid ? int(body.draftUid, { name: 'draftUid', min: 1 }) : null;
  let inReplyToRef;
  if (body.inReplyToRef && typeof body.inReplyToRef === 'object') {
    inReplyToRef = {
      folder: folderPath(body.inReplyToRef.folder),
      uid: int(body.inReplyToRef.uid, { name: 'uid', min: 1 }),
      mode: body.inReplyToRef.mode === 'forward' ? 'forward' : 'reply',
    };
  }
  return {
    to,
    cc,
    bcc,
    subject,
    html,
    text,
    inReplyTo,
    references,
    priority,
    attachments,
    draftUid,
    inReplyToRef,
  };
}

function parseAttachmentRef(ref) {
  if (!ref || typeof ref !== 'object') throw errors.badRequest('Invalid attachment.');
  if (ref.source === 'upload') {
    return {
      source: 'upload',
      id: str(ref.id, { name: 'attachment', max: 64, required: true, pattern: /^[a-f0-9]{32}$/ }),
      cid: ref.cid ? str(ref.cid, { max: 200 }) : undefined,
    };
  }
  if (ref.source === 'message') {
    return {
      source: 'message',
      folder: folderPath(ref.folder),
      uid: int(ref.uid, { name: 'uid', min: 1 }),
      part: str(ref.part, {
        name: 'part',
        max: 40,
        required: true,
        pattern: /^[0-9.]+$|^fallback-\d+$/,
      }),
      filename: str(ref.filename, { max: 255 }),
      cid: ref.cid ? str(ref.cid, { max: 200 }) : undefined,
    };
  }
  throw errors.badRequest('Invalid attachment.');
}
