import { create } from 'zustand';
import { getActiveAccount } from '@/stores/account-store';

let counter = 0;

/**
 * Compose windows. Several can be open at once (desktop); each keeps its own
 * draft state and autosave bookkeeping.
 *
 * @typedef {Object} ComposeWindow
 * @property {string} id
 * @property {string|null} account mailbox the message is written from (fixed for the window's life)
 * @property {'new'|'reply'|'replyAll'|'forward'|'draft'} mode
 * @property {boolean} minimized
 * @property {boolean} expanded
 * @property {object} data { to, cc, bcc, subject, html, attachments, inReplyTo, references, inReplyToRef, draftUid }
 */
export const useComposeStore = create((set, get) => ({
  windows: [],

  open: (init = {}) => {
    const id = `c${Date.now().toString(36)}${(counter++).toString(36)}`;
    const win = {
      id,
      account: init.account || getActiveAccount(),
      mode: init.mode || 'new',
      minimized: false,
      expanded: false,
      data: {
        to: [],
        cc: [],
        bcc: [],
        subject: '',
        html: '',
        attachments: [],
        inReplyTo: null,
        references: [],
        inReplyToRef: null,
        draftUid: null,
        signatureId: undefined,
        ...(init.data || {}),
      },
      showCc: !!(init.data?.cc && init.data.cc.length),
      showBcc: !!(init.data?.bcc && init.data.bcc.length),
      dirty: false,
      savedAt: null,
      saving: false,
    };
    // Keep at most 3 windows open; minimize older ones.
    const windows = get().windows.map((w) => ({ ...w, minimized: true }));
    set({ windows: [...windows, win].slice(-3) });
    return id;
  },

  update: (id, patch) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, ...(typeof patch === 'function' ? patch(w) : patch) } : w
      ),
    })),

  updateData: (id, patch) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? {
              ...w,
              dirty: true,
              data: { ...w.data, ...(typeof patch === 'function' ? patch(w.data) : patch) },
            }
          : w
      ),
    })),

  close: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),
  /** Drops the windows of a mailbox that was signed out. */
  closeForAccount: (account) =>
    set((s) => ({ windows: s.windows.filter((w) => w.account !== account) })),
  minimize: (id, minimized = true) => get().update(id, { minimized }),
  expand: (id, expanded) =>
    get().update(id, (w) => ({ expanded: expanded ?? !w.expanded, minimized: false })),
  focus: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => ({ ...w, minimized: w.id !== id ? w.minimized : false })),
    })),
}));
