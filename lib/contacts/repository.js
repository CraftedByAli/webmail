import { getDb } from '@/lib/db';
import { generateId } from '@/lib/security/crypto';
import { isValidEmail } from '@/lib/mime/address';
import { errors } from '@/lib/api/errors';

/**
 * Contacts data layer.
 *
 * Two sources feed autocomplete: explicit contacts (user-managed) and address
 * suggestions harvested from mail the user sent or received. The repository
 * API is deliberately storage-agnostic so a CardDAV/SOGo backend can replace
 * the SQLite implementation later.
 */

/**
 * Records addresses seen in sent/received mail for autocomplete.
 * @param {string} owner
 * @param {Array<{ name?: string, address: string }>} addresses
 * @param {'sent'|'received'} source
 */
export function rememberAddresses(owner, addresses, source) {
  if (!addresses || addresses.length === 0) return;
  const db = getDb();
  const weight = source === 'sent' ? 3 : 1;
  const stmt = db.prepare(
    `INSERT INTO address_suggestions (owner_email, email, name, weight, last_used_at)
     VALUES (@owner, @email, @name, @weight, @now)
     ON CONFLICT(owner_email, email) DO UPDATE SET
       weight = weight + @weight,
       name = CASE WHEN excluded.name != '' THEN excluded.name ELSE address_suggestions.name END,
       last_used_at = @now`
  );
  const now = Date.now();
  const run = db.transaction((list) => {
    for (const a of list) {
      const email = String(a.address || '')
        .toLowerCase()
        .trim();
      if (!isValidEmail(email) || email === owner.toLowerCase()) continue;
      if (/no-?reply|donotreply|mailer-daemon|bounce/i.test(email)) continue;
      stmt.run({
        owner: owner.toLowerCase(),
        email,
        name: String(a.name || '').slice(0, 200),
        weight,
        now,
      });
    }
  });
  try {
    run(addresses);
  } catch {
    // Suggestions are best-effort.
  }
}

/**
 * Autocomplete: merges saved contacts and harvested suggestions.
 * @param {string} owner
 * @param {string} q
 * @param {number} limit
 */
export function suggestAddresses(owner, q, limit = 8) {
  const db = getDb();
  const term = `%${String(q || '')
    .toLowerCase()
    .trim()}%`;
  const contacts = db
    .prepare(
      `SELECT name, email, 1000 AS weight FROM contacts
       WHERE owner_email = ? AND (lower(email) LIKE ? OR lower(name) LIKE ?) LIMIT ?`
    )
    .all(owner.toLowerCase(), term, term, limit);
  const suggestions = db
    .prepare(
      `SELECT name, email, weight FROM address_suggestions
       WHERE owner_email = ? AND (lower(email) LIKE ? OR lower(name) LIKE ?)
       ORDER BY weight DESC, last_used_at DESC LIMIT ?`
    )
    .all(owner.toLowerCase(), term, term, limit * 2);
  const seen = new Set();
  const out = [];
  for (const row of [...contacts, ...suggestions]) {
    if (seen.has(row.email)) continue;
    seen.add(row.email);
    out.push({ name: row.name || '', address: row.email });
    if (out.length >= limit) break;
  }
  return out;
}

export function listContacts(owner, { q = '', limit = 200 } = {}) {
  const term = `%${q.toLowerCase().trim()}%`;
  return getDb()
    .prepare(
      `SELECT id, name, email, company, notes, source, created_at, updated_at FROM contacts
       WHERE owner_email = ? AND (lower(email) LIKE ? OR lower(name) LIKE ? OR lower(company) LIKE ?)
       ORDER BY lower(name), email LIMIT ?`
    )
    .all(owner.toLowerCase(), term, term, term, limit)
    .map(rowToContact);
}

export function getContact(owner, id) {
  const row = getDb()
    .prepare('SELECT * FROM contacts WHERE owner_email = ? AND id = ?')
    .get(owner.toLowerCase(), id);
  return row ? rowToContact(row) : null;
}

export function createContact(owner, input) {
  const data = validateContact(input);
  const id = generateId();
  const now = Date.now();
  try {
    getDb()
      .prepare(
        `INSERT INTO contacts (id, owner_email, name, email, company, notes, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`
      )
      .run(id, owner.toLowerCase(), data.name, data.email, data.company, data.notes, now, now);
  } catch (error) {
    if (/UNIQUE/.test(String(error.message)))
      throw errors.badRequest('A contact with that email already exists.');
    throw error;
  }
  return getContact(owner, id);
}

export function updateContact(owner, id, input) {
  const data = validateContact(input);
  const result = getDb()
    .prepare(
      'UPDATE contacts SET name = ?, email = ?, company = ?, notes = ?, updated_at = ? WHERE owner_email = ? AND id = ?'
    )
    .run(data.name, data.email, data.company, data.notes, Date.now(), owner.toLowerCase(), id);
  if (result.changes === 0) throw errors.notFound('Contact not found.');
  return getContact(owner, id);
}

export function deleteContact(owner, id) {
  const result = getDb()
    .prepare('DELETE FROM contacts WHERE owner_email = ? AND id = ?')
    .run(owner.toLowerCase(), id);
  return result.changes > 0;
}

function validateContact(input) {
  const email = String(input?.email || '')
    .trim()
    .toLowerCase();
  if (!isValidEmail(email)) throw errors.badRequest('Enter a valid email address.');
  return {
    email,
    name: String(input?.name || '')
      .trim()
      .slice(0, 200),
    company: String(input?.company || '')
      .trim()
      .slice(0, 200),
    notes: String(input?.notes || '')
      .trim()
      .slice(0, 5000),
  };
}

function rowToContact(row) {
  return {
    id: row.id,
    name: row.name || '',
    email: row.email,
    company: row.company || '',
    notes: row.notes || '',
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
