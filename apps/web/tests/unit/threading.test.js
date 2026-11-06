import { describe, it, expect } from 'vitest';
import { buildThreads, normalizeSubject } from '@/lib/mail/threading';

const msg = (over) => ({
  uid: over.uid,
  folder: 'INBOX',
  messageId: over.messageId || null,
  inReplyTo: over.inReplyTo || null,
  references: over.references || [],
  subject: over.subject || '',
  from: over.from || { name: 'A', address: 'a@example.com' },
  to: over.to || [{ name: 'B', address: 'b@example.com' }],
  cc: [],
  date: over.date || new Date(2024, 0, over.uid).toISOString(),
  size: 1,
  flags: {
    seen: over.seen ?? true,
    flagged: !!over.flagged,
    answered: false,
    draft: false,
    deleted: false,
  },
  hasAttachment: !!over.hasAttachment,
  preview: '',
});

describe('normalizeSubject', () => {
  it('strips reply and forward prefixes in several languages', () => {
    expect(normalizeSubject('Re: Re: Fwd: Hello')).toBe('hello');
    expect(normalizeSubject('AW: Hallo')).toBe('hallo');
    expect(normalizeSubject('RE[2]: Hello')).toBe('hello');
    expect(normalizeSubject('  Hello   World ')).toBe('hello world');
  });
});

describe('buildThreads', () => {
  it('groups by In-Reply-To / References', () => {
    const threads = buildThreads([
      msg({ uid: 1, messageId: 'a' }),
      msg({ uid: 2, messageId: 'b', inReplyTo: 'a', references: ['a'] }),
      msg({ uid: 3, messageId: 'c', references: ['a', 'b'] }),
      msg({ uid: 4, messageId: 'd', subject: 'Unrelated' }),
    ]);
    expect(threads).toHaveLength(2);
    const big = threads.find((t) => t.count === 3);
    expect(big.uids).toEqual([1, 2, 3]);
    expect(big.latest.uid).toBe(3);
  });

  it('joins siblings that reference a missing common ancestor', () => {
    const threads = buildThreads([
      msg({ uid: 1, messageId: 'x', inReplyTo: 'root-missing' }),
      msg({ uid: 2, messageId: 'y', inReplyTo: 'root-missing' }),
    ]);
    expect(threads).toHaveLength(1);
  });

  it('falls back to subject + participant matching for broken headers', () => {
    const threads = buildThreads([
      msg({ uid: 1, subject: 'Lunch?', from: { name: 'A', address: 'a@example.com' } }),
      msg({
        uid: 2,
        subject: 'Re: Lunch?',
        from: { name: 'B', address: 'b@example.com' },
        to: [{ address: 'a@example.com' }],
      }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].subject).toBe('Lunch?');
  });

  it('does not merge unrelated messages with the same subject', () => {
    const threads = buildThreads([
      msg({
        uid: 1,
        subject: 'Hello',
        from: { address: 'a@example.com' },
        to: [{ address: 'me@example.com' }],
      }),
      msg({
        uid: 2,
        subject: 'Hello',
        from: { address: 'z@example.com' },
        to: [{ address: 'q@example.com' }],
      }),
    ]);
    expect(threads).toHaveLength(2);
  });

  it('computes aggregate flags and sorts newest first', () => {
    const threads = buildThreads([
      msg({ uid: 1, messageId: 'a', seen: true, date: '2024-01-01T00:00:00Z' }),
      msg({
        uid: 2,
        messageId: 'b',
        inReplyTo: 'a',
        seen: false,
        flagged: true,
        hasAttachment: true,
        date: '2024-01-05T00:00:00Z',
      }),
      msg({ uid: 3, messageId: 'c', subject: 'Newer', date: '2024-02-01T00:00:00Z' }),
    ]);
    expect(threads[0].subject).toBe('Newer');
    expect(threads[1].unread).toBe(true);
    expect(threads[1].starred).toBe(true);
    expect(threads[1].hasAttachment).toBe(true);
    expect(threads[1].participants.map((p) => p.address)).toEqual(['a@example.com']);
  });
});
