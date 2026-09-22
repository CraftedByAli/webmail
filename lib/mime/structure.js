/**
 * Walks an IMAP BODYSTRUCTURE tree and classifies parts into what the viewer
 * needs: the best text/HTML bodies, inline (cid) images and attachments.
 *
 * @typedef {Object} PartInfo
 * @property {string} part IMAP part number, e.g. "1.2"
 * @property {string} type lowercase content type
 * @property {string} [charset]
 * @property {string} [encoding]
 * @property {number} [size]
 * @property {string} [contentId]
 * @property {string} [filename]
 * @property {string} [disposition]
 * @property {boolean} [flowed]
 *
 * @typedef {Object} StructureSummary
 * @property {PartInfo|null} html
 * @property {PartInfo|null} text
 * @property {PartInfo[]} inline  cid-referenced parts (usually images)
 * @property {PartInfo[]} attachments
 */

function toPartInfo(node, fallbackPart) {
  const type = (node.type || 'application/octet-stream').toLowerCase();
  const filename = node.dispositionParameters?.filename || node.parameters?.name || null;
  return {
    part: node.part || fallbackPart,
    type,
    charset: node.parameters?.charset,
    encoding: node.encoding,
    size: node.size || 0,
    contentId: node.id ? String(node.id).replace(/[<>]/g, '') : null,
    filename,
    disposition: (node.disposition || '').toLowerCase() || null,
    flowed: (node.parameters?.format || '').toLowerCase() === 'flowed',
  };
}

/**
 * @param {import('imapflow').MessageStructureObject} root
 * @returns {StructureSummary}
 */
export function summarizeStructure(root) {
  /** @type {StructureSummary} */
  const out = { html: null, text: null, inline: [], attachments: [] };
  if (!root) return out;
  walk(root, out);
  return out;
}

function walk(node, out) {
  const type = (node.type || '').toLowerCase();

  if (node.childNodes && node.childNodes.length) {
    for (const child of node.childNodes) walk(child, out);
    return;
  }

  const info = toPartInfo(node, '1');
  const isAttachmentDisposition = info.disposition === 'attachment';

  if (!isAttachmentDisposition && (info.type === 'text/html' || info.type === 'text/plain')) {
    if (info.type === 'text/html' && !out.html) {
      out.html = info;
      return;
    }
    if (info.type === 'text/plain' && !out.text) {
      out.text = info;
      return;
    }
    // Additional text parts (e.g. forwarded text) are exposed as attachments.
    if (info.filename) out.attachments.push(info);
    return;
  }

  if (info.contentId && info.disposition !== 'attachment' && info.type.startsWith('image/')) {
    out.inline.push(info);
    return;
  }

  if (type.startsWith('multipart/')) return; // empty multipart
  out.attachments.push(info);
}

/** Finds a part by its IMAP part number in the structure tree. */
export function findPart(root, partNumber) {
  if (!root) return null;
  if (!root.childNodes && (root.part || '1') === partNumber) return toPartInfo(root, '1');
  if (root.childNodes) {
    for (const child of root.childNodes) {
      const found = findPart(child, partNumber);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Decodes a transfer-decoded body buffer to a string using its charset.
 * @param {Buffer} buffer
 * @param {string} [charset]
 */
export function decodeText(buffer, charset) {
  if (!buffer) return '';
  const cs = normalizeCharset(charset);
  try {
    return new TextDecoder(cs, { fatal: false }).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

export function normalizeCharset(charset) {
  const cs = (charset || 'utf-8').toLowerCase().trim();
  if (cs === 'us-ascii' || cs === 'ascii') return 'utf-8';
  if (cs === 'cp1252' || cs === 'win-1252') return 'windows-1252';
  if (cs === 'iso-8859-1' || cs === 'latin1') return 'windows-1252'; // browsers treat these alike
  return cs.replace(/[^a-z0-9_-]/g, '') || 'utf-8';
}

/** Unfolds format=flowed text (RFC 3676) into normal paragraphs. */
export function unflowText(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let buffer = null;
  const flush = () => {
    if (buffer !== null) out.push(`${buffer.quote}${buffer.quote ? ' ' : ''}${buffer.text}`);
    buffer = null;
  };
  for (let line of lines) {
    if (line.startsWith(' ')) line = line.slice(1); // space-stuffing
    const quoteMatch = line.match(/^(>+)\s?/);
    const quote = quoteMatch ? quoteMatch[1] : '';
    const content = quoteMatch ? line.slice(quoteMatch[0].length) : line;
    const soft = content.endsWith(' ') && content !== '-- ';
    if (buffer !== null && buffer.quote === quote) {
      buffer.text += content;
    } else {
      flush();
      buffer = { quote, text: content };
    }
    if (!soft) flush();
  }
  flush();
  return out.join('\n');
}

/** Escapes text for embedding in HTML. */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Converts plain text to safe HTML with clickable links and quote styling. */
export function textToHtml(text) {
  const escaped = escapeHtml(text || '');
  const linked = escaped.replace(
    /\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
  const lines = linked.split(/\r?\n/).map((line) => {
    const m = line.match(/^(&gt;\s?)+/);
    if (m) {
      const depth = (m[0].match(/&gt;/g) || []).length;
      const content = line.slice(m[0].length);
      let html = content;
      for (let i = 0; i < depth; i++) html = `<blockquote class="q">${html}</blockquote>`;
      return html;
    }
    return line;
  });
  return `<div class="plain">${lines.join('<br>')}</div>`;
}
