/**
 * Conversation threading.
 *
 * Primary key: Message-ID / In-Reply-To / References (a simplified JWZ
 * algorithm). Fallback: normalised subject + a sender/recipient overlap, for
 * mail from clients that mangle headers. Works on any list of summaries, so
 * it can group a page of results, a server THREAD result, or a whole mailbox.
 *
 * @typedef {import('@/lib/imap/client').MessageSummary} MessageSummary
 *
 * @typedef {Object} Thread
 * @property {string} id stable id (message-id of the root, or uid-based)
 * @property {MessageSummary[]} messages sorted oldest → newest
 * @property {MessageSummary} latest
 * @property {string} subject
 * @property {number} count
 * @property {boolean} unread
 * @property {boolean} starred
 * @property {boolean} hasAttachment
 * @property {Array<import('@/lib/mime/address').Address>} participants
 * @property {number[]} uids
 * @property {string|null} date newest message date
 */

const SUBJECT_PREFIX_RE = /^\s*((re|fw|fwd|aw|wg|sv|vs|tr|rv|r|f)\s*(\[\d+\])?\s*:\s*)+/i;

/** Strips Re:/Fwd: prefixes and whitespace so replies match their originals. */
export function normalizeSubject(subject) {
  return (subject || '').replace(SUBJECT_PREFIX_RE, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Groups messages into threads.
 * @param {MessageSummary[]} messages
 * @param {{ subjectFallback?: boolean }} [options]
 * @returns {Thread[]}
 */
export function buildThreads(messages, options = {}) {
  const subjectFallback = options.subjectFallback !== false;
  const byId = new Map();
  for (const m of messages) if (m.messageId) byId.set(m.messageId, m);

  // Union-find over message indexes.
  const parent = messages.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const indexById = new Map();
  messages.forEach((m, i) => {
    if (m.messageId) indexById.set(m.messageId, i);
  });

  // Also index by the set of ids each message references so siblings that
  // only share a common (absent) ancestor still join.
  const referenceOwners = new Map();
  messages.forEach((m, i) => {
    const refs = new Set([...(m.references || []), ...(m.inReplyTo ? [m.inReplyTo] : [])]);
    for (const ref of refs) {
      if (indexById.has(ref)) union(i, indexById.get(ref));
      if (!referenceOwners.has(ref)) referenceOwners.set(ref, i);
      else union(i, referenceOwners.get(ref));
    }
  });

  if (subjectFallback) {
    // Subject-based fallback: only glue together messages that look like a
    // reply chain (at least one carries a Re:/Fwd: prefix) and share a
    // participant, to avoid merging unrelated "Hello" emails.
    const bySubject = new Map();
    messages.forEach((m, i) => {
      const key = normalizeSubject(m.subject);
      if (!key) return;
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push(i);
    });
    for (const indexes of bySubject.values()) {
      if (indexes.length < 2) continue;
      for (let a = 0; a < indexes.length; a++) {
        for (let b = a + 1; b < indexes.length; b++) {
          const ma = messages[indexes[a]];
          const mb = messages[indexes[b]];
          const isReply =
            SUBJECT_PREFIX_RE.test(ma.subject || '') || SUBJECT_PREFIX_RE.test(mb.subject || '');
          if (isReply && shareParticipant(ma, mb) && withinDays(ma, mb, 60))
            union(indexes[a], indexes[b]);
        }
      }
    }
  }

  const groups = new Map();
  messages.forEach((m, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(m);
  });

  const threads = [...groups.values()].map(toThread);
  threads.sort(compareThreadsNewestFirst);
  return threads;
}

/**
 * @param {MessageSummary[]} group
 * @returns {Thread}
 */
export function toThread(group) {
  const messages = [...group].sort((a, b) => {
    const da = a.date ? Date.parse(a.date) : 0;
    const db = b.date ? Date.parse(b.date) : 0;
    if (da !== db) return da - db;
    return a.uid - b.uid;
  });
  const latest = messages[messages.length - 1];
  const root = messages[0];
  const participants = [];
  const seen = new Set();
  for (const m of messages) {
    if (m.from && !seen.has(m.from.address)) {
      seen.add(m.from.address);
      participants.push(m.from);
    }
  }
  return {
    id: threadId(root),
    messages,
    latest,
    subject: root.subject || latest.subject || '',
    count: messages.length,
    unread: messages.some((m) => !m.flags.seen),
    starred: messages.some((m) => m.flags.flagged),
    hasAttachment: messages.some((m) => m.hasAttachment),
    participants,
    uids: messages.map((m) => m.uid),
    date: latest.date,
  };
}

/** Newest conversation first: by latest message date, then by UID. */
export function compareThreadsNewestFirst(a, b) {
  const da = a.date ? Date.parse(a.date) : 0;
  const db = b.date ? Date.parse(b.date) : 0;
  if (da !== db) return db - da;
  return (b.latest.uid || 0) - (a.latest.uid || 0);
}

export function threadId(message) {
  if (message.messageId) return `mid:${message.messageId}`;
  return `uid:${message.folder}:${message.uid}`;
}

function shareParticipant(a, b) {
  const setA = new Set(
    [
      a.from?.address,
      ...(a.to || []).map((x) => x.address),
      ...(a.cc || []).map((x) => x.address),
    ].filter(Boolean)
  );
  return [
    b.from?.address,
    ...(b.to || []).map((x) => x.address),
    ...(b.cc || []).map((x) => x.address),
  ].some((x) => x && setA.has(x));
}

function withinDays(a, b, days) {
  if (!a.date || !b.date) return true;
  return Math.abs(Date.parse(a.date) - Date.parse(b.date)) <= days * 86400000;
}
