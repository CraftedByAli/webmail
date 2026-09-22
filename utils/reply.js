import { formatFullDate } from '@/utils/format';

/**
 * Builds compose window data for reply / reply-all / forward from a loaded
 * message. Quoting keeps the original HTML (already sanitized by the server)
 * inside a blockquote, Gmail-style.
 */

function escape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addressLabel(a) {
  if (!a) return '';
  return a.name ? `${escape(a.name)} &lt;${escape(a.address)}&gt;` : escape(a.address);
}

function subjectWithPrefix(subject, prefix) {
  const s = (subject || '').trim();
  const re = prefix === 'Re' ? /^(re|aw|sv)\s*:/i : /^(fwd?|wg|tr)\s*:/i;
  return re.test(s) ? s : `${prefix}: ${s}`;
}

function bodyHtml(message) {
  if (message.body?.kind === 'html' && message.body.html) return message.body.html;
  return (
    message.body?.html ||
    `<pre style="white-space:pre-wrap;font-family:inherit">${escape(message.body?.text || '')}</pre>`
  );
}

function references(message) {
  const refs = [...(message.references || [])];
  if (message.messageId && !refs.includes(message.messageId)) refs.push(message.messageId);
  return refs.slice(-30);
}

export function buildReply(message, { all = false, me, signatureHtml = '' } = {}) {
  const replyTo =
    message.replyTo && message.replyTo.length
      ? message.replyTo
      : message.from
        ? [message.from]
        : [];
  let to = replyTo;
  let cc = [];
  if (all) {
    const exclude = new Set([me, ...to.map((a) => a.address)].filter(Boolean));
    const others = [...(message.to || []), ...(message.cc || [])].filter(
      (a) => a.address && !exclude.has(a.address)
    );
    const seen = new Set();
    cc = others.filter((a) => (seen.has(a.address) ? false : (seen.add(a.address), true)));
    // If the sender is me (replying to my own message), reply to original recipients instead.
    if (to.length === 1 && to[0].address === me) {
      to = cc.length ? cc : to;
      cc = [];
    }
  } else if (to.length === 1 && to[0].address === me && (message.to || []).length) {
    to = message.to;
  }

  const header = `On ${escape(formatFullDate(message.date))}, ${addressLabel(message.from)} wrote:`;
  const html = `<p></p>${signatureHtml ? `<p></p>${signatureHtml}` : ''}<p></p><div class="gmail_quote"><div>${header}</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${bodyHtml(message)}</blockquote></div>`;

  return {
    mode: all ? 'replyAll' : 'reply',
    data: {
      to,
      cc,
      bcc: [],
      subject: subjectWithPrefix(message.subject, 'Re'),
      html,
      attachments: [],
      inReplyTo: message.messageId || null,
      references: references(message),
      inReplyToRef: { folder: message.folder, uid: message.uid, mode: 'reply' },
    },
  };
}

export function buildForward(message, { signatureHtml = '' } = {}) {
  const lines = [
    `<b>From:</b> ${addressLabel(message.from)}`,
    `<b>Date:</b> ${escape(formatFullDate(message.date))}`,
    `<b>Subject:</b> ${escape(message.subject || '(no subject)')}`,
    `<b>To:</b> ${(message.to || []).map(addressLabel).join(', ')}`,
    ...((message.cc || []).length ? [`<b>Cc:</b> ${message.cc.map(addressLabel).join(', ')}`] : []),
  ];
  const html = `<p></p>${signatureHtml ? `<p></p>${signatureHtml}` : ''}<p></p><div class="gmail_quote"><div>---------- Forwarded message ---------</div><div>${lines.join('<br>')}</div><br>${bodyHtml(message)}</div>`;
  return {
    mode: 'forward',
    data: {
      to: [],
      cc: [],
      bcc: [],
      subject: subjectWithPrefix(message.subject, 'Fwd'),
      html,
      attachments: (message.attachments || []).map((a) => ({
        id: `msg-${message.uid}-${a.part}`,
        source: 'message',
        folder: message.folder,
        uid: message.uid,
        part: a.part,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      })),
      inReplyTo: null,
      references: [],
      inReplyToRef: { folder: message.folder, uid: message.uid, mode: 'forward' },
    },
  };
}

/** Restores a draft into compose state. */
export function buildFromDraft(message) {
  return {
    mode: 'draft',
    data: {
      to: message.to || [],
      cc: message.cc || [],
      bcc: message.bcc || [],
      subject: message.subject || '',
      html:
        message.body?.kind === 'html'
          ? message.body.html
          : `<p>${escape(message.body?.text || '').replace(/\n/g, '<br>')}</p>`,
      attachments: (message.attachments || []).map((a) => ({
        id: `msg-${message.uid}-${a.part}`,
        source: 'message',
        folder: message.folder,
        uid: message.uid,
        part: a.part,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      })),
      inReplyTo: message.inReplyTo || null,
      references: message.references || [],
      inReplyToRef: null,
      draftUid: message.uid,
    },
  };
}
