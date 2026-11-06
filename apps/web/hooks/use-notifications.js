'use client';

/**
 * Browser notifications for new mail. Permission is requested only from an
 * explicit user action (the Notifications settings toggle). Multiple arrivals
 * inside a short window are grouped into one notification.
 */

let pending = [];
let flushTimer = null;

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'denied';
}

/** Must be called from a user gesture. */
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * @param {object[]} messages
 * @param {object} preferences
 * @param {{ account?: string, multi?: boolean }} [context]
 */
export function notifyNewMail(messages, preferences, { account, multi = false } = {}) {
  if (!preferences?.notifications?.desktop) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  pending.push(...messages.map((m) => ({ ...m, account })));
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const batch = pending;
    pending = [];
    flushTimer = null;
    if (batch.length === 0) return;
    const first = batch[0];
    const mailboxes = [...new Set(batch.map((m) => m.account).filter(Boolean))];
    const title =
      batch.length === 1
        ? first.from?.name || first.from?.address || 'New email'
        : `${batch.length} new emails`;
    const suffix = multi && mailboxes.length ? `\n${mailboxes.join(', ')}` : '';
    const body =
      batch.length === 1
        ? first.subject || '(no subject)'
        : batch
            .slice(0, 3)
            .map((m) => `${m.from?.name || m.from?.address}: ${m.subject || '(no subject)'}`)
            .join('\n');
    try {
      const n = new Notification(title, {
        body: body + suffix,
        tag: 'osmicmails-new-mail',
        icon: '/icons/icon.svg',
        silent: !preferences.notifications.sound,
      });
      n.onclick = () => {
        window.focus();
        const accountParam = first.account ? `account=${encodeURIComponent(first.account)}` : '';
        window.location.assign(
          batch.length === 1
            ? `/mail/inbox/message/${first.uid}?folder=INBOX${accountParam ? `&${accountParam}` : ''}`
            : `/mail/inbox${accountParam ? `?${accountParam}` : ''}`
        );
        n.close();
      };
      if (preferences.notifications.sound) playChime();
    } catch {
      // Notification constructor can throw on some mobile browsers.
    }
  }, 1500);
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // no audio
  }
}
