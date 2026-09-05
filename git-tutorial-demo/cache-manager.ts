/**
 * In-Memory TTL Cache Manager
 * Provides key-value caching with expiration and automatic cleanup.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheManager {
  private static store = new Map<string, CacheEntry<unknown>>();

  static set<T>(key: string, value: T, ttlSeconds = 300): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  static get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  static has(key: string): boolean {
    return this.get(key) !== null;
  }

  static async getOrSet<T>(key: string, factory: () => Promise<T> | T, ttlSeconds = 300): Promise<T> {
    const existing = this.get<T>(key);
    if (existing !== null) {
      return existing;
    }

    const freshValue = await factory();
    this.set(key, freshValue, ttlSeconds);
    return freshValue;
  }

  static size(): number {
    let activeCount = 0;
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now <= entry.expiresAt) {
        activeCount++;
      } else {
        this.store.delete(key);
      }
    }
    return activeCount;
  }

  static keys(): string[] {
    return Array.from(this.store.keys());
  }

  static delete(key: string): void {
    this.store.delete(key);
  }

  static clear(): void {
    this.store.clear();
  }
}

