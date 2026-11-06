import { describe, it, expect } from 'vitest';
import {
  parseAddress,
  parseAddressList,
  formatAddress,
  isValidEmail,
  dedupeAddresses,
  initials,
} from '@/lib/mime/address';

describe('address helpers', () => {
  it('validates emails', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('not an email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });

  it('parses display names', () => {
    expect(parseAddress('"John Smith" <John@Example.com>')).toEqual({
      name: 'John Smith',
      address: 'john@example.com',
    });
    expect(parseAddress('plain@example.com')).toEqual({ name: '', address: 'plain@example.com' });
    expect(parseAddress('garbage')).toBeNull();
  });

  it('parses lists with quoted commas', () => {
    const list = parseAddressList('"Smith, John" <j@example.com>, k@example.com; bad');
    expect(list.map((a) => a.address)).toEqual(['j@example.com', 'k@example.com']);
    expect(list[0].name).toBe('Smith, John');
  });

  it('formats and quotes names when needed', () => {
    expect(formatAddress({ name: 'John', address: 'j@x.com' })).toBe('John <j@x.com>');
    expect(formatAddress({ name: 'Smith, John', address: 'j@x.com' })).toBe(
      '"Smith, John" <j@x.com>'
    );
  });

  it('dedupes case-insensitively with exclusions', () => {
    const out = dedupeAddresses(
      [{ address: 'A@x.com' }, { address: 'a@x.com' }, { address: 'b@x.com' }],
      ['b@x.com']
    );
    expect(out).toHaveLength(1);
  });

  it('computes initials', () => {
    expect(initials({ name: 'John Smith', address: 'j@x.com' })).toBe('JS');
    expect(initials({ name: '', address: 'jane.doe@x.com' })).toBe('JD');
  });
});
