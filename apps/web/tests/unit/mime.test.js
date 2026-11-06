import { describe, it, expect } from 'vitest';
import {
  summarizeStructure,
  findPart,
  decodeText,
  unflowText,
  textToHtml,
} from '@/lib/mime/structure';
import { decodePreview } from '@/lib/mime/preview';
import {
  hasAttachmentNode,
  findPreviewPart,
  parseHeaderBlock,
  splitMessageIds,
  cleanMessageId,
} from '@/lib/imap/client';
import { parseFullMessage } from '@/lib/mime/parse';
import { buildMessage } from '@/lib/smtp/compose';
import { buildFolderModel, detectRole } from '@/lib/imap/folders';
import { classifyPresentation, splitQuotedContent } from '@/lib/mime/html-analysis';

const structure = {
  type: 'multipart/mixed',
  childNodes: [
    {
      type: 'multipart/alternative',
      childNodes: [
        {
          part: '1.1',
          type: 'text/plain',
          encoding: 'quoted-printable',
          parameters: { charset: 'utf-8', format: 'flowed' },
        },
        {
          type: 'multipart/related',
          childNodes: [
            {
              part: '1.2.1',
              type: 'text/html',
              encoding: 'base64',
              parameters: { charset: 'utf-8' },
            },
            { part: '1.2.2', type: 'image/png', id: '<logo@x>', disposition: 'inline', size: 10 },
          ],
        },
      ],
    },
    {
      part: '2',
      type: 'application/pdf',
      disposition: 'attachment',
      dispositionParameters: { filename: 'a.pdf' },
      size: 100,
    },
    { part: '3', type: 'application/pgp-signature' },
  ],
};

describe('bodystructure', () => {
  it('classifies parts', () => {
    const s = summarizeStructure(structure);
    expect(s.text.part).toBe('1.1');
    expect(s.text.flowed).toBe(true);
    expect(s.html.part).toBe('1.2.1');
    expect(s.inline.map((p) => p.contentId)).toEqual(['logo@x']);
    expect(s.attachments.map((p) => p.part)).toEqual(['2', '3']);
  });
  it('finds parts and detects attachments', () => {
    expect(findPart(structure, '2').filename).toBe('a.pdf');
    expect(findPart(structure, '9')).toBeNull();
    expect(hasAttachmentNode(structure)).toBe(true);
    expect(hasAttachmentNode({ type: 'text/plain' })).toBe(false);
    expect(findPreviewPart(structure).part).toBe('1.1');
  });
});

describe('text decoding', () => {
  it('decodes charsets', () => {
    expect(decodeText(Buffer.from([0xe9]), 'iso-8859-1')).toBe('é');
    expect(decodeText(Buffer.from('héllo'), 'utf-8')).toBe('héllo');
  });
  it('unflows format=flowed text', () => {
    expect(unflowText('This is a \nlong line\n> quoted \n> text')).toBe(
      'This is a long line\n> quoted text'
    );
  });
  it('converts text to safe html with links and grouped quotes', () => {
    const html = textToHtml('see <b>https://example.com/x\n> quoted\n> more quoted\nafter');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('<a href="https://example.com/x"');
    // Consecutive quoted lines collapse into one blockquote so the reply
    // history can be trimmed as a single block.
    expect(html).toContain('<blockquote class="wm-quote">quoted<br>more quoted</blockquote>');
    expect(html).toContain('after');
  });
  it('builds previews from truncated encoded fragments', () => {
    expect(
      decodePreview(Buffer.from('Hello=20wor=C3=A9ld=C'), {
        encoding: 'quoted-printable',
        charset: 'utf-8',
      })
    ).toBe('Hello woréld');
    const b64 = Buffer.from('<p>Hi <b>there</b></p><style>x{}</style>').toString('base64');
    expect(
      decodePreview(Buffer.from(b64.slice(0, b64.length - 1)), {
        encoding: 'base64',
        type: 'text/html',
      })
    ).toContain('Hi there');
  });
});

describe('headers', () => {
  it('parses folded header blocks and message ids', () => {
    const h = parseHeaderBlock(
      Buffer.from('References: <a@x>\r\n <b@x>\r\nIn-Reply-To: <b@x>\r\n\r\n')
    );
    expect(splitMessageIds(h.references)).toEqual(['a@x', 'b@x']);
    expect(cleanMessageId(' <c@x> ')).toBe('c@x');
  });
});

describe('compose + parse round trip', () => {
  it('builds a MIME message with threading headers and attachments', async () => {
    const { raw, messageId, envelope } = await buildMessage({
      from: { name: 'Me', address: 'me@example.com' },
      payload: {
        to: [{ name: 'John', address: 'john@example.com' }],
        cc: [{ address: 'cc@example.com' }],
        bcc: [{ address: 'bcc@example.com' }],
        subject: 'Re: Hi',
        html: '<p>Hello <b>John</b><script>x</script></p>',
        inReplyTo: 'orig@example.com',
        references: ['root@example.com', 'orig@example.com'],
        attachments: [
          { filename: '../evil.txt', contentType: 'text/plain', content: Buffer.from('data') },
        ],
      },
    });
    const text = raw.toString();
    expect(text).toContain('In-Reply-To: <orig@example.com>');
    expect(text).toContain('References: <root@example.com> <orig@example.com>');
    expect(text).toContain(`Message-ID: <${messageId}>`);
    expect(text).not.toContain('Bcc:');
    expect(envelope.to).toEqual(['john@example.com', 'cc@example.com', 'bcc@example.com']);
    const parsed = await parseFullMessage(raw);
    expect(parsed.html).toContain('<b>John</b>');
    expect(parsed.html).not.toContain('script');
    expect(parsed.text).toContain('Hello John');
    expect(parsed.attachments[0].filename).toBe('evil.txt');
  });

  it('rejects invalid recipients', async () => {
    await expect(
      buildMessage({
        from: { address: 'me@example.com' },
        payload: { to: [{ address: 'nope' }], subject: 'x' },
      })
    ).rejects.toThrow(/valid email/);
    await expect(
      buildMessage({ from: { address: 'me@example.com' }, payload: { to: [], subject: 'x' } })
    ).rejects.toThrow(/recipient/);
  });
});

describe('folders', () => {
  const entry = (path, extra = {}) => ({
    path,
    name: path.split('/').pop(),
    delimiter: '/',
    parent: path.includes('/') ? path.split('/').slice(0, -1) : [],
    parentPath: '',
    flags: new Set(),
    listed: true,
    subscribed: true,
    ...extra,
  });
  it('detects roles from special-use flags and names', () => {
    expect(detectRole(entry('INBOX'))).toBe('inbox');
    expect(detectRole(entry('Gesendet', { specialUse: '\\Sent' }))).toBe('sent');
    expect(detectRole(entry('Junk E-mail'))).toBe('junk');
    expect(detectRole(entry('Deleted Items'))).toBe('trash');
    expect(detectRole(entry('Projects/Trash'))).toBeNull();
  });
  it('assigns each role once, preferring server flags, and sorts', () => {
    const { folders, roles } = buildFolderModel([
      entry('Zeta'),
      entry('Trash'),
      entry('Papierkorb', {
        specialUse: '\\Trash',
        specialUseSource: 'extension',
        status: { messages: 3, unseen: 1 },
      }),
      entry('INBOX', { status: { messages: 10, unseen: 2 } }),
    ]);
    expect(roles.trash).toBe('Papierkorb');
    expect(folders[0].path).toBe('INBOX');
    expect(folders[0].unread).toBe(2);
    expect(folders.find((f) => f.path === 'Trash').role).toBeNull();
  });
});

describe('email presentation analysis', () => {
  it('treats plain correspondence as app-themed', () => {
    expect(classifyPresentation('<p>Hi, see you at 10.</p>')).toBe('app');
    expect(classifyPresentation('<div>Thanks!<br><b>Ali</b></div>')).toBe('app');
  });

  it('treats designed mail as sender-themed so its own colours survive', () => {
    expect(
      classifyPresentation('<table width="600" bgcolor="#ffffff"><tr><td>a</td></tr></table>')
    ).toBe('sender');
    expect(classifyPresentation('<div style="background-color:#f5f5f5">promo</div>')).toBe(
      'sender'
    );
    expect(classifyPresentation('<div style="background:transparent">plain</div>')).toBe('app');
  });

  it('does not treat a white background as a design', () => {
    // Outlook and Word stamp these onto ordinary replies; reading them as
    // sender-designed puts a white sheet in the middle of dark mode.
    expect(classifyPresentation('<div style="background-color:#ffffff">Thanks, Ali</div>')).toBe(
      'app'
    );
    expect(classifyPresentation('<body bgcolor="#FFFFFF"><p>See you at ten.</p></body>')).toBe(
      'app'
    );
    expect(classifyPresentation('<div style="background:white">Sounds good.</div>')).toBe('app');
    expect(classifyPresentation('<td style="background-color: rgb(255, 255, 255)">Hi</td>')).toBe(
      'app'
    );
  });

  it('treats a highlight on a run of text as text, not layout', () => {
    expect(
      classifyPresentation(
        '<p>Due <span style="background-color:yellow">Friday</span>, thanks.</p>'
      )
    ).toBe('app');
  });

  it('still reads real template shells as sender-designed', () => {
    expect(classifyPresentation('<table width="600"><tr><td>Newsletter</td></tr></table>')).toBe(
      'sender'
    );
    expect(
      classifyPresentation('<table style="width:640px"><tr><td>Newsletter</td></tr></table>')
    ).toBe('sender');
    // A narrow table is a spacer, not a template shell.
    expect(classifyPresentation('<table width="20"><tr><td>x</td></tr></table>')).toBe('app');
  });

  it('splits quoted history from new content', () => {
    const { main, quoted } = splitQuotedContent(
      '<p>Sure, that works for me.</p><div class="gmail_quote"><blockquote>Can we meet tomorrow at ten?</blockquote></div>'
    );
    expect(main).toBe('<p>Sure, that works for me.</p>');
    expect(quoted).toContain('Can we meet tomorrow');
  });

  it('keeps the message whole when there is no meaningful split', () => {
    expect(
      splitQuotedContent('<p>No quoted history in this message at all.</p>').quoted
    ).toBeNull();
    // A reply with no new text above the quote must not render as empty.
    expect(
      splitQuotedContent('<div class="gmail_quote">Only quoted history here, nothing else.</div>')
        .quoted
    ).toBeNull();
  });
});
