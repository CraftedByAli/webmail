/**
 * Tiny TTL cache with prefix invalidation. Values are held in memory only;
 * nothing sensitive is written to disk.
 */
export class MemoryCache {
  constructor({ maxEntries = 5000 } = {}) {
    /** @type {Map<string, { value: any, expiresAt: number }>} */
    this.map = new Map();
    this.maxEntries = maxEntries;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.map.size >= this.maxEntries) {
      // Evict the oldest entry (Map preserves insertion order).
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  delete(key) {
    this.map.delete(key);
  }

  deletePrefix(prefix) {
    let count = 0;
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
        count += 1;
      }
    }
    return count;
  }

  /**
   * @template T
   * @param {string} key
   * @param {number} ttlMs
   * @param {() => Promise<T>} loader
   * @returns {Promise<T>}
   */
  async remember(key, ttlMs, loader) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    this.set(key, value, ttlMs);
    return value;
  }

  clear() {
    this.map.clear();
  }
}
