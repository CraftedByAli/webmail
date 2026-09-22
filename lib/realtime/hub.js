/**
 * In-process pub/sub hub connecting the IMAP IDLE listeners to SSE clients.
 * Each browser tab subscribes with the mailbox address; events are fanned out
 * to every subscriber of that mailbox.
 */

class RealtimeHub {
  constructor() {
    /** @type {Map<string, Set<(event: object) => void>>} */
    this.subscribers = new Map();
  }

  subscribe(email, handler) {
    const key = email.toLowerCase();
    if (!this.subscribers.has(key)) this.subscribers.set(key, new Set());
    this.subscribers.get(key).add(handler);
    return () => {
      const set = this.subscribers.get(key);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) this.subscribers.delete(key);
    };
  }

  publish(email, event) {
    const set = this.subscribers.get(email.toLowerCase());
    if (!set) return 0;
    for (const handler of set) {
      try {
        handler(event);
      } catch {
        // A broken subscriber must not break the others.
      }
    }
    return set.size;
  }

  subscriberCount(email) {
    return this.subscribers.get(email.toLowerCase())?.size || 0;
  }
}

const globalKey = Symbol.for('webmail.realtimeHub');
if (!globalThis[globalKey]) globalThis[globalKey] = new RealtimeHub();

/** @type {RealtimeHub} */
export const realtimeHub = globalThis[globalKey];
