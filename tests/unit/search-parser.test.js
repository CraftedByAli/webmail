import { describe, it, expect } from 'vitest';
import { parseSearchQuery, toImapSearch, isEmptyQuery } from '@/lib/search/query-parser';

describe('parseSearchQuery', () => {
  it('parses operators and free text', () => {
    const q = parseSearchQuery(
      'from:john@example.com subject:"quarterly report" has:attachment is:unread urgent'
    );
    expect(q.from).toEqual(['john@example.com']);
    expect(q.subject).toEqual(['quarterly report']);
    expect(q.hasAttachment).toBe(true);
    expect(q.unread).toBe(true);
    expect(q.text).toEqual(['urgent']);
  });

  it('parses dates, negation and folder', () => {
    const q = parseSearchQuery('after:2024-01-15 before:2024/02/01 -is:starred in:sent larger:2mb');
    expect(q.after).toBe('2024-01-15T00:00:00.000Z');
    expect(q.before).toBe('2024-02-01T00:00:00.000Z');
    expect(q.starred).toBe(false);
    expect(q.folder).toBe('sent');
    expect(q.larger).toBe(2 * 1024 * 1024);
  });

  it('keeps unknown operators as text', () => {
    const q = parseSearchQuery('foo:bar hello');
    expect(q.unknown).toEqual(['foo:bar']);
    expect(q.text).toEqual(['bar', 'hello']);
  });

  it('detects empty queries', () => {
    expect(isEmptyQuery(parseSearchQuery(''))).toBe(true);
    expect(isEmptyQuery(parseSearchQuery('in:sent'))).toBe(true);
    expect(isEmptyQuery(parseSearchQuery('hi'))).toBe(false);
  });
});

describe('toImapSearch', () => {
  it('compiles simple criteria', () => {
    const c = toImapSearch(parseSearchQuery('from:john is:unread'));
    expect(c).toEqual({ from: 'john', seen: false });
  });

  it('compiles repeated keys to nested AND', () => {
    const c = toImapSearch(parseSearchQuery('from:john from:jane'));
    expect(c.not).toBeDefined();
    expect(c.not.or).toHaveLength(2);
  });

  it('returns all for empty', () => {
    expect(toImapSearch(parseSearchQuery(''))).toEqual({ all: true });
  });
});
