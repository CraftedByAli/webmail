import { simpleParser } from 'mailparser';
import { normalizeAddressList } from '@/lib/mime/address';

/**
 * Fallback parser for messages whose BODYSTRUCTURE we could not make sense
 * of. Parses the full RFC822 source with mailparser (bounded by the message
 * size limit enforced upstream).
 *
 * @param {Buffer} source
 */
export async function parseFullMessage(source) {
  const parsed = await simpleParser(source, {
    skipImageLinks: true,
    skipTextToHtml: true,
    skipTextLinks: true,
  });
  const attachments = (parsed.attachments || []).map((a, index) => ({
    index,
    filename: a.filename || null,
    contentType: (a.contentType || 'application/octet-stream').toLowerCase(),
    size: a.size || (a.content ? a.content.length : 0),
    contentId: a.contentId ? String(a.contentId).replace(/[<>]/g, '') : null,
    inline: a.contentDisposition === 'inline' && !!a.contentId,
    content: a.content,
  }));
  return {
    messageId: parsed.messageId ? parsed.messageId.replace(/[<>]/g, '') : null,
    inReplyTo: parsed.inReplyTo ? parsed.inReplyTo.replace(/[<>]/g, '') : null,
    references: normalizeReferences(parsed.references),
    subject: parsed.subject || '',
    from: normalizeAddressList(parsed.from?.value)[0] || null,
    to: normalizeAddressList(parsed.to?.value),
    cc: normalizeAddressList(parsed.cc?.value),
    bcc: normalizeAddressList(parsed.bcc?.value),
    replyTo: normalizeAddressList(parsed.replyTo?.value),
    date: parsed.date ? parsed.date.toISOString() : null,
    html: typeof parsed.html === 'string' ? parsed.html : null,
    text: parsed.text || null,
    headers: parsed.headers,
    attachments,
  };
}

function normalizeReferences(refs) {
  if (!refs) return [];
  const list = Array.isArray(refs) ? refs : String(refs).split(/\s+/);
  return list.map((r) => String(r).replace(/[<>]/g, '').trim()).filter(Boolean);
}
