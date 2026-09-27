'use client';

import { useEffect, useRef } from 'react';

/**
 * Gmail-inspired keyboard shortcuts. Handlers receive no arguments; the
 * caller decides what "current" means. Disabled while typing in inputs and
 * when the user turned shortcuts off in settings.
 *
 * @param {Record<string, () => void>} handlers keyed by shortcut id
 * @param {{ enabled: boolean }} options
 */
export function useKeyboardShortcuts(handlers, { enabled = true } = {}) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    let pendingG = false;
    let gTimer = null;

    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable)
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return; // dialogs handle their own keys (Escape etc.)
      }

      const key = event.key;
      const h = ref.current;
      const fire = (name) => {
        if (h[name]) {
          event.preventDefault();
          h[name]();
        }
      };

      if (pendingG) {
        pendingG = false;
        clearTimeout(gTimer);
        if (key === 'i') return fire('goInbox');
        if (key === 's') return fire('goStarred');
        if (key === 't') return fire('goSent');
        if (key === 'd') return fire('goDrafts');
        if (/^[1-9]$/.test(key) && h.switchMailbox) {
          event.preventDefault();
          h.switchMailbox(Number(key));
        }
        return undefined;
      }

      if (key === 'g') {
        pendingG = true;
        gTimer = setTimeout(() => {
          pendingG = false;
        }, 1200);
        return undefined;
      }

      if (event.shiftKey) {
        if (key === 'I') return fire('markRead');
        if (key === 'U') return fire('markUnread');
        if (key === '#') return fire('delete');
        if (key === '!') return fire('spam');
        if (key === '?') return fire('help');
        return undefined;
      }

      switch (key) {
        case 'c':
          return fire('compose');
        case 'r':
          return fire('reply');
        case 'a':
          return fire('replyAll');
        case 'f':
          return fire('forward');
        case 'e':
          return fire('archive');
        case '#':
          return fire('delete');
        case 'u':
          return fire('back');
        case 'j':
          return fire('next');
        case 'k':
          return fire('previous');
        case 's':
          return fire('star');
        case 'x':
          return fire('select');
        case 'o':
        case 'Enter':
          return fire('open');
        case '/':
          return fire('search');
        case 'Escape':
          return fire('escape');
        case '?':
          return fire('help');
        default:
          return undefined;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(gTimer);
    };
  }, [enabled]);
}

/** Grouped for the help dialog and the settings reference. */
export const SHORTCUT_GROUPS = [
  {
    title: 'Navigate',
    items: [
      { keys: ['j'], label: 'Next conversation' },
      { keys: ['k'], label: 'Previous conversation' },
      { keys: ['o', 'Enter'], label: 'Open conversation' },
      { keys: ['u'], label: 'Back to list' },
      { keys: ['g', 'i'], label: 'Go to Inbox', sequence: true },
      { keys: ['g', 's'], label: 'Go to Starred', sequence: true },
      { keys: ['g', 't'], label: 'Go to Sent', sequence: true },
      { keys: ['g', 'd'], label: 'Go to Drafts', sequence: true },
      { keys: ['g', '1–9'], label: 'Switch to mailbox 1–9', sequence: true },
    ],
  },
  {
    title: 'Triage',
    items: [
      { keys: ['x'], label: 'Select conversation' },
      { keys: ['e'], label: 'Archive' },
      { keys: ['#'], label: 'Delete' },
      { keys: ['!'], label: 'Report spam' },
      { keys: ['s'], label: 'Star or unstar' },
      { keys: ['Shift', 'i'], label: 'Mark as read', sequence: true },
      { keys: ['Shift', 'u'], label: 'Mark as unread', sequence: true },
    ],
  },
  {
    title: 'Write',
    items: [
      { keys: ['c'], label: 'Compose' },
      { keys: ['r'], label: 'Reply' },
      { keys: ['a'], label: 'Reply all' },
      { keys: ['f'], label: 'Forward' },
    ],
  },
  {
    title: 'General',
    items: [
      { keys: ['/'], label: 'Search' },
      { keys: ['Esc'], label: 'Close or clear selection' },
      { keys: ['?'], label: 'Show this dialog' },
    ],
  },
];

/** Flat list, used by the settings reference table. */
export const SHORTCUT_LIST = SHORTCUT_GROUPS.flatMap((g) => g.items);
