import { getDb } from '@/lib/db';
import { generateId } from '@/lib/security/crypto';
import { sanitizeComposeHtml } from '@/lib/security/sanitize-html';
import { errors } from '@/lib/api/errors';

export function listSignatures(email) {
  return getDb()
    .prepare(
      'SELECT id, name, html, is_default, created_at, updated_at FROM signatures WHERE email = ? ORDER BY is_default DESC, lower(name)'
    )
    .all(email.toLowerCase())
    .map(rowToSignature);
}

export function getDefaultSignature(email) {
  const row = getDb()
    .prepare('SELECT * FROM signatures WHERE email = ? AND is_default = 1')
    .get(email.toLowerCase());
  return row ? rowToSignature(row) : null;
}

export function createSignature(email, input) {
  const data = validate(input);
  const db = getDb();
  const id = generateId();
  const now = Date.now();
  db.transaction(() => {
    if (data.isDefault)
      db.prepare('UPDATE signatures SET is_default = 0 WHERE email = ?').run(email.toLowerCase());
    db.prepare(
      'INSERT INTO signatures (id, email, name, html, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, email.toLowerCase(), data.name, data.html, data.isDefault ? 1 : 0, now, now);
  })();
  return listSignatures(email).find((s) => s.id === id);
}

export function updateSignature(email, id, input) {
  const data = validate(input);
  const db = getDb();
  const changes = db.transaction(() => {
    if (data.isDefault)
      db.prepare('UPDATE signatures SET is_default = 0 WHERE email = ?').run(email.toLowerCase());
    return db
      .prepare(
        'UPDATE signatures SET name = ?, html = ?, is_default = ?, updated_at = ? WHERE email = ? AND id = ?'
      )
      .run(data.name, data.html, data.isDefault ? 1 : 0, Date.now(), email.toLowerCase(), id)
      .changes;
  })();
  if (changes === 0) throw errors.notFound('Signature not found.');
  return listSignatures(email).find((s) => s.id === id);
}

export function deleteSignature(email, id) {
  return (
    getDb()
      .prepare('DELETE FROM signatures WHERE email = ? AND id = ?')
      .run(email.toLowerCase(), id).changes > 0
  );
}

function validate(input) {
  const name = String(input?.name || '')
    .trim()
    .slice(0, 100);
  if (!name) throw errors.badRequest('Give the signature a name.');
  const html = sanitizeComposeHtml(String(input?.html || '')).slice(0, 20000);
  return { name, html, isDefault: !!input?.isDefault };
}

function rowToSignature(row) {
  return {
    id: row.id,
    name: row.name,
    html: row.html,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
