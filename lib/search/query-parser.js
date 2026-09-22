/**
 * Parses Gmail-style search syntax into a structured query.
 *
 *   from:john@example.com subject:invoice has:attachment is:unread
 *   after:2024-01-01 before:2024-02-01 "exact phrase" in:sent
 *
 * The output is backend-agnostic: it is compiled to IMAP SEARCH today and can
 * be compiled to a full-text index later without touching the frontend.
 *
 * @typedef {Object} ParsedQuery
 * @property {string[]} text free-text terms
 * @property {string[]} from
 * @property {string[]} to
 * @property {string[]} cc
 * @property {string[]} subject
 * @property {boolean} hasAttachment
 * @property {boolean|null} unread
 * @property {boolean|null} starred
 * @property {boolean|null} answered
 * @property {string|null} after ISO date
 * @property {string|null} before ISO date
 * @property {string|null} folder
 * @property {number|null} larger bytes
 * @property {number|null} smaller bytes
 * @property {string[]} unknown unrecognised operators (kept as text)
 */

const TOKEN_RE = /(?:(-)?(\w+):)?("([^"]*)"|(\S+))/g;

export function parseSearchQuery(input) {
  /** @type {ParsedQuery} */
  const query = {
    text: [],
    from: [],
    to: [],
    cc: [],
    subject: [],
    hasAttachment: false,
    unread: null,
    starred: null,
    answered: null,
    after: null,
    before: null,
    folder: null,
    larger: null,
    smaller: null,
    unknown: [],
  };
  if (!input || typeof input !== 'string') return query;

  for (const match of input.trim().matchAll(TOKEN_RE)) {
    const negated = !!match[1];
    const op = match[2] ? match[2].toLowerCase() : null;
    const value = match[4] !== undefined ? match[4] : match[5];
    if (!value) continue;

    if (!op) {
      query.text.push(value);
      continue;
    }

    switch (op) {
      case 'from':
        query.from.push(value);
        break;
      case 'to':
        query.to.push(value);
        break;
      case 'cc':
        query.cc.push(value);
        break;
      case 'subject':
        query.subject.push(value);
        break;
      case 'has':
        if (value.toLowerCase() === 'attachment') query.hasAttachment = !negated;
        break;
      case 'is':
      case 'label': {
        const v = value.toLowerCase();
        if (v === 'unread') query.unread = !negated;
        else if (v === 'read') query.unread = negated;
        else if (v === 'starred' || v === 'flagged') query.starred = !negated;
        else if (v === 'answered' || v === 'replied') query.answered = !negated;
        else query.unknown.push(`${op}:${value}`);
        break;
      }
      case 'after':
      case 'since':
        query.after = parseDate(value);
        break;
      case 'before':
        query.before = parseDate(value);
        break;
      case 'in':
      case 'folder':
        query.folder = value;
        break;
      case 'larger':
      case 'size':
        query.larger = parseSize(value);
        break;
      case 'smaller':
        query.smaller = parseSize(value);
        break;
      default:
        query.unknown.push(`${op}:${value}`);
        query.text.push(value);
    }
  }
  return query;
}

function parseDate(value) {
  const normalized = value.replace(/\//g, '-');
  const m = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const rel = normalized.match(/^(\d+)([dwmy])$/i);
  if (rel) {
    const n = Number(rel[1]);
    const d = new Date();
    const unit = rel[2].toLowerCase();
    if (unit === 'd') d.setUTCDate(d.getUTCDate() - n);
    if (unit === 'w') d.setUTCDate(d.getUTCDate() - n * 7);
    if (unit === 'm') d.setUTCMonth(d.getUTCMonth() - n);
    if (unit === 'y') d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseSize(value) {
  const m = value.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(k|kb|m|mb|g|gb)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] || '';
  if (unit.startsWith('k')) return Math.round(n * 1024);
  if (unit.startsWith('m')) return Math.round(n * 1024 * 1024);
  if (unit.startsWith('g')) return Math.round(n * 1024 * 1024 * 1024);
  return Math.round(n);
}

/**
 * Compiles a parsed query into an imapflow SearchObject.
 * @param {ParsedQuery} query
 * @returns {import('imapflow').SearchObject}
 */
export function toImapSearch(query) {
  /** @type {import('imapflow').SearchObject} */
  const criteria = {};
  const clauses = [];

  for (const v of query.from) clauses.push({ from: v });
  for (const v of query.to) clauses.push({ to: v });
  for (const v of query.cc) clauses.push({ cc: v });
  for (const v of query.subject) clauses.push({ subject: v });
  for (const v of query.text) {
    // Gmail matches free text against headers and body. IMAP TEXT does both.
    clauses.push({ text: v });
  }
  if (query.unread === true) clauses.push({ seen: false });
  if (query.unread === false) clauses.push({ seen: true });
  if (query.starred === true) clauses.push({ flagged: true });
  if (query.starred === false) clauses.push({ flagged: false });
  if (query.answered === true) clauses.push({ answered: true });
  if (query.answered === false) clauses.push({ answered: false });
  if (query.after) clauses.push({ since: new Date(query.after) });
  if (query.before) clauses.push({ before: new Date(query.before) });
  if (query.larger) clauses.push({ larger: query.larger });
  if (query.smaller) clauses.push({ smaller: query.smaller });
  if (query.hasAttachment) {
    // IMAP has no attachment flag; Content-Type multipart/mixed is the
    // pragmatic approximation used by most clients. Results are refined
    // client-side using the real BODYSTRUCTURE.
    clauses.push({
      or: [
        { header: { 'content-type': 'multipart/mixed' } },
        { header: { 'content-type': 'multipart/related' } },
      ],
    });
  }

  if (clauses.length === 0) return { all: true };
  // imapflow ANDs keys of a single object; merge non-conflicting keys, nest the rest.
  let merged = {};
  const nested = [];
  for (const clause of clauses) {
    const key = Object.keys(clause)[0];
    if (merged[key] === undefined) merged = { ...merged, ...clause };
    else nested.push(clause);
  }
  if (nested.length === 0) return merged;
  // Represent AND of duplicates via chained NOT(OR(NOT a, NOT b)) — imapflow
  // supports `not` and `or`, so encode a AND b as NOT (NOT a OR NOT b).
  let result = merged;
  for (const clause of nested) {
    result = { not: { or: [{ not: result }, { not: clause }] } };
  }
  Object.assign(criteria, result);
  return criteria;
}

/** True if the query only filters by flags / folder and needs no text search. */
export function isEmptyQuery(query) {
  return (
    query.text.length === 0 &&
    query.from.length === 0 &&
    query.to.length === 0 &&
    query.cc.length === 0 &&
    query.subject.length === 0 &&
    !query.hasAttachment &&
    query.unread === null &&
    query.starred === null &&
    query.answered === null &&
    !query.after &&
    !query.before &&
    !query.larger &&
    !query.smaller
  );
}
