import { Readable } from 'node:stream';
import { describe, it, expect } from 'vitest';
import { attachmentResponse } from '@/lib/api/stream';
import { estimateDecodedSize, findPart, summarizeStructure } from '@/lib/mime/structure';
import { inferContentType } from '@/lib/security/mime';
import { attachmentUrl } from '@/lib/mail/imap-smtp-provider';
import {
  effectiveType,
  parseDelimited,
  previewKind,
  downloadUrl,
  inlineUrl,
} from '@/utils/attachments';

const stream = (text) => Readable.from([Buffer.from(text)]);

describe('attachment responses', () => {
  it('never advertises the encoded BODYSTRUCTURE size as Content-Length', async () => {
    // base64 size 1368 for a ~1000-byte file: the old bug made browsers abort.
    const res = attachmentResponse(
      {
        meta: { filename: 'a.pdf', contentType: 'application/pdf', size: 1368 },
        stream: stream('%PDF'),
        release: () => {},
      },
      { download: true }
    );
    expect(res.headers.get('content-length')).toBeNull();
    expect(await res.text()).toBe('%PDF');
  });

  it('sends Content-Length only when the exact byte count is known', async () => {
    const res = attachmentResponse(
      {
        meta: { filename: 'a.txt', contentType: 'text/plain', exactSize: 5 },
        stream: stream('hello'),
        release: () => {},
      },
      { download: true }
    );
    expect(res.headers.get('content-length')).toBe('5');
    expect(await res.text()).toBe('hello');
  });

  it('serves previews inline with same-origin framing only, and releases the connection', async () => {
    let released = 0;
    const res = attachmentResponse(
      {
        meta: { filename: 'scan.pdf', contentType: 'application/octet-stream' },
        stream: stream('%PDF'),
        release: () => released++,
      },
      { download: false }
    );
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    await res.text();
    expect(released).toBe(1);
  });

  it('never renders active content inline', () => {
    const res = attachmentResponse(
      {
        meta: { filename: 'x.html', contentType: 'text/html' },
        stream: stream('<script>'),
        release: () => {},
      },
      { download: false }
    );
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('infers types from extensions only towards the inline-safe allow-list', () => {
    expect(inferContentType('application/octet-stream', 'photo.JPG')).toBe('image/jpeg');
    expect(inferContentType('', 'doc.pdf')).toBe('application/pdf');
    expect(inferContentType('application/octet-stream', 'evil.html')).toBe(
      'application/octet-stream'
    );
    expect(inferContentType('image/png', 'x.pdf')).toBe('image/png');
  });
});

describe('MIME structure', () => {
  const root = {
    type: 'multipart/mixed',
    childNodes: [
      { part: '1', type: 'text/plain', parameters: { charset: 'utf-8' }, size: 20 },
      {
        part: '2',
        type: 'message/rfc822',
        size: 900,
        envelope: { subject: 'Fwd: Q3 numbers' },
        childNodes: [
          { part: '2.1', type: 'text/html', size: 300 },
          {
            part: '2.2',
            type: 'application/pdf',
            disposition: 'attachment',
            dispositionParameters: { filename: 'inner.pdf' },
            size: 400,
          },
        ],
      },
      {
        part: '3',
        type: 'application/pdf',
        encoding: 'base64',
        disposition: 'attachment',
        dispositionParameters: { filename: 'r.pdf' },
        size: 1368,
      },
    ],
  };

  it('treats an attached e-mail as one downloadable file and keeps our own body', () => {
    const s = summarizeStructure(root);
    expect(s.html).toBeNull();
    expect(s.text.part).toBe('1');
    expect(s.attachments.map((a) => a.part)).toEqual(['2', '3']);
    expect(s.attachments[0]).toMatchObject({ type: 'message/rfc822', subject: 'Fwd: Q3 numbers' });
    expect(findPart(root, '2')).toMatchObject({ type: 'message/rfc822' });
    expect(findPart(root, '2.2')).toMatchObject({ filename: 'inner.pdf' });
  });

  it('estimates decoded sizes for base64 parts', () => {
    expect(estimateDecodedSize(1368, 'base64')).toBe(1000);
    expect(estimateDecodedSize(1000, '7bit')).toBe(1000);
    expect(estimateDecodedSize(0, 'base64')).toBe(0);
  });

  it('pins attachment URLs to their mailbox', () => {
    const url = attachmentUrl({ folder: 'INBOX/Sub', uid: 7, part: '2', account: 'sales@x.com' });
    expect(url).toBe('/api/attachments?folder=INBOX%2FSub&uid=7&part=2&account=sales%40x.com');
    expect(attachmentUrl({ folder: 'INBOX', uid: 1, part: '3', inline: true })).toMatch(
      /^\/api\/attachments\/inline\?/
    );
  });
});

describe('browser attachment helpers', () => {
  it('classifies previews, falling back to the extension for generic types', () => {
    expect(previewKind({ filename: 'a.png', contentType: 'image/png', size: 10 })).toBe('image');
    expect(
      previewKind({ filename: 'a.svg', contentType: 'application/octet-stream', size: 10 })
    ).toBe('image');
    expect(
      previewKind({ filename: 'a.pdf', contentType: 'application/octet-stream', size: 10 })
    ).toBe('pdf');
    expect(previewKind({ filename: 'a.csv', contentType: 'text/csv', size: 10 })).toBe('csv');
    expect(previewKind({ filename: 'a.json', contentType: 'application/json', size: 10 })).toBe(
      'text'
    );
    expect(previewKind({ filename: 'm.eml', contentType: 'message/rfc822', size: 10 })).toBe(
      'text'
    );
    expect(previewKind({ filename: 'v.mp4', contentType: 'video/mp4', size: 10 })).toBe('video');
    expect(
      previewKind({
        filename: 'a.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 10,
      })
    ).toBeNull();
    expect(
      previewKind({ filename: 'huge.png', contentType: 'image/png', size: 500 * 1024 * 1024 })
    ).toBeNull();
    expect(effectiveType({ filename: 'x.JPG', contentType: '' })).toBe('image/jpeg');
  });

  it('builds download / inline URLs without dropping the mailbox parameter', () => {
    const a = { url: '/api/attachments?folder=INBOX&uid=1&part=2&account=a%40b.c' };
    expect(downloadUrl(a)).toContain('download=1');
    expect(downloadUrl(a)).toContain('account=a%40b.c');
    expect(inlineUrl(a)).toContain('download=0');
  });

  it('parses CSV with quotes, escaped quotes and CRLF', () => {
    const { rows } = parseDelimited('name,note\r\n"Doe, J","said ""hi"""\r\nx,y');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Doe, J', 'said "hi"'],
      ['x', 'y'],
    ]);
    const capped = parseDelimited('a\nb\nc\nd', ',', 2);
    expect(capped.rows).toHaveLength(2);
    expect(capped.truncated).toBe(true);
  });
});
