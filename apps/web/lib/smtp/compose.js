import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { convert } from 'html-to-text';
import { getConfig } from '@/lib/config/env';
import { formatAddress, isValidEmail } from '@/lib/mime/address';
import { sanitizeComposeHtml } from '@/lib/security/sanitize-html';
import { sanitizeFilename } from '@/lib/security/filename';
import { errors } from '@/lib/api/errors';

/**
 * Builds an RFC822 message from a compose payload. Used both for sending and
 * for saving drafts, so drafts round-trip exactly what will be sent.
 *
 * @typedef {Object} ComposePayload
 * @property {import('@/lib/mime/address').Address[]} to
 * @property {import('@/lib/mime/address').Address[]} [cc]
 * @property {import('@/lib/mime/address').Address[]} [bcc]
 * @property {import('@/lib/mime/address').Address} [replyTo]
 * @property {string} subject
 * @property {string} [html]
 * @property {string} [text]
 * @property {string} [inReplyTo]
 * @property {string[]} [references]
 * @property {Array<{ filename: string, contentType: string, content: Buffer | import('stream').Readable, cid?: string, size?: number }>} [attachments]
 * @property {'high'|'normal'|'low'} [priority]
 */

/**
 * @param {{ from: import('@/lib/mime/address').Address, payload: ComposePayload, messageId?: string, isDraft?: boolean }} input
 * @returns {Promise<{ raw: Buffer, messageId: string, envelope: { from: string, to: string[] } }>}
 */
export async function buildMessage({ from, payload, messageId, isDraft = false }) {
  const { app } = getConfig();
  const to = validateRecipients(payload.to, isDraft);
  const cc = validateRecipients(payload.cc || [], true);
  const bcc = validateRecipients(payload.bcc || [], true);
  if (!isDraft && to.length + cc.length + bcc.length === 0) {
    throw errors.badRequest('Add at least one recipient.');
  }

  const html = payload.html ? sanitizeComposeHtml(payload.html) : null;
  const text =
    payload.text ||
    (html ? convert(html, { wordwrap: 78, selectors: [{ selector: 'img', format: 'skip' }] }) : '');

  const domain = from.address.split('@')[1] || new URL(app.url).hostname;
  const id = messageId || `<${cryptoRandom()}@${domain}>`;

  const attachments = (payload.attachments || []).map((a) => ({
    filename: sanitizeFilename(a.filename),
    content: a.content,
    contentType: a.contentType || 'application/octet-stream',
    cid: a.cid || undefined,
    contentDisposition: a.cid ? 'inline' : 'attachment',
  }));

  const headers = {};
  if (payload.priority === 'high') {
    headers['X-Priority'] = '1 (Highest)';
    headers.Importance = 'high';
  } else if (payload.priority === 'low') {
    headers['X-Priority'] = '5 (Lowest)';
    headers.Importance = 'low';
  }

  const composer = new MailComposer({
    from: formatAddress(from),
    to: to.map(formatAddress),
    cc: cc.map(formatAddress),
    bcc: bcc.map(formatAddress),
    replyTo: payload.replyTo ? formatAddress(payload.replyTo) : undefined,
    subject: payload.subject || '',
    text: text || undefined,
    html: html || undefined,
    inReplyTo: payload.inReplyTo ? `<${payload.inReplyTo}>` : undefined,
    references:
      payload.references && payload.references.length
        ? payload.references.map((r) => `<${r}>`).join(' ')
        : undefined,
    messageId: id,
    date: new Date(),
    attachments,
    headers,
    xMailer: 'OsmicMails',
  });

  const raw = await composer.compile().build();
  const envelopeTo = [...to, ...cc, ...bcc].map((a) => a.address);
  return {
    raw,
    messageId: id.replace(/[<>]/g, ''),
    envelope: { from: from.address, to: envelopeTo },
  };
}

function validateRecipients(list, allowEmpty) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const address = typeof item === 'string' ? item : item?.address;
    if (!isValidEmail(address)) {
      throw errors.badRequest(
        `"${String(address || '').slice(0, 80)}" is not a valid email address.`
      );
    }
    out.push({
      name: typeof item === 'string' ? '' : String(item.name || '').slice(0, 200),
      address: address.trim().toLowerCase(),
    });
  }
  if (!allowEmpty && out.length === 0) throw errors.badRequest('Add at least one recipient.');
  if (out.length > 100) throw errors.badRequest('Too many recipients (maximum 100).');
  return out;
}

function cryptoRandom() {
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}.${Math.random().toString(36).slice(2, 8)}`;
}
