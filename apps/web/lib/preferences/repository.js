import { getDb } from '@/lib/db';

/**
 * User preferences, stored as a single JSON document per mailbox.
 */

export const DEFAULT_PREFERENCES = Object.freeze({
  general: {
    displayName: '',
    language: 'en',
    timezone: 'auto',
    dateFormat: 'auto',
    replyBehavior: 'reply', // 'reply' | 'replyAll'
  },
  appearance: {
    theme: 'system', // light | dark | system
    density: 'comfortable', // comfortable | compact
  },
  inbox: {
    pageSize: 50,
    conversationView: true,
    previewText: true,
    defaultFolder: 'INBOX',
    autoLoadImages: false,
  },
  notifications: {
    newMail: true,
    desktop: false,
    sound: false,
  },
  shortcuts: {
    enabled: true,
  },
  compose: {
    defaultSignatureId: null,
    sendAndArchive: false,
  },
});

const SCHEMA = {
  general: {
    displayName: (v) => String(v || '').slice(0, 120),
    language: (v) => (/^[a-z]{2}(-[A-Z]{2})?$/.test(v) ? v : 'en'),
    timezone: (v) => (typeof v === 'string' && v.length < 64 ? v : 'auto'),
    dateFormat: (v) => (['auto', 'dmy', 'mdy', 'ymd'].includes(v) ? v : 'auto'),
    replyBehavior: (v) => (['reply', 'replyAll'].includes(v) ? v : 'reply'),
  },
  appearance: {
    theme: (v) => (['light', 'dark', 'system'].includes(v) ? v : 'system'),
    density: (v) => (['comfortable', 'compact'].includes(v) ? v : 'comfortable'),
  },
  inbox: {
    pageSize: (v) => ([25, 50, 100].includes(Number(v)) ? Number(v) : 50),
    conversationView: (v) => !!v,
    previewText: (v) => !!v,
    defaultFolder: (v) => (typeof v === 'string' && v.length < 200 ? v : 'INBOX'),
    autoLoadImages: (v) => !!v,
  },
  notifications: {
    newMail: (v) => !!v,
    desktop: (v) => !!v,
    sound: (v) => !!v,
  },
  shortcuts: {
    enabled: (v) => !!v,
  },
  compose: {
    defaultSignatureId: (v) => (typeof v === 'string' && v.length < 64 ? v : null),
    sendAndArchive: (v) => !!v,
  },
};

export function getPreferences(email) {
  const row = getDb()
    .prepare('SELECT data FROM user_preferences WHERE email = ?')
    .get(email.toLowerCase());
  let stored = {};
  if (row) {
    try {
      stored = JSON.parse(row.data);
    } catch {
      stored = {};
    }
  }
  return mergePreferences(DEFAULT_PREFERENCES, stored);
}

/**
 * Applies a partial update (deep merge over sections) with validation.
 * @param {string} email
 * @param {object} patch
 */
export function updatePreferences(email, patch) {
  const current = getPreferences(email);
  const next = mergePreferences(current, patch || {});
  getDb()
    .prepare(
      `INSERT INTO user_preferences (email, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(email.toLowerCase(), JSON.stringify(next), Date.now());
  return next;
}

function mergePreferences(base, patch) {
  const out = {};
  for (const section of Object.keys(SCHEMA)) {
    out[section] = {};
    for (const key of Object.keys(SCHEMA[section])) {
      const validate = SCHEMA[section][key];
      const incoming = patch?.[section]?.[key];
      out[section][key] =
        incoming !== undefined ? validate(incoming) : validate(base?.[section]?.[key]);
    }
  }
  return out;
}
