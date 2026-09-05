/**
 * Token Bucket Rate Limiter
 * Throttles client or API actions based on capacity and refill rate.
 */

export class RateLimiter {
  private capacity: number;
  private refillRatePerSecond: number;
  private tokens: number;
  private lastRefillTimestamp: number;

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.refillRatePerSecond = refillRatePerSecond;
    this.tokens = capacity;
    this.lastRefillTimestamp = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedTimeInSeconds = (now - this.lastRefillTimestamp) / 1000;
    const addedTokens = elapsedTimeInSeconds * this.refillRatePerSecond;

    this.tokens = Math.min(this.capacity, this.tokens + addedTokens);
    this.lastRefillTimestamp = now;
  }

  tryConsume(tokens = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  reset(): void {
    this.tokens = this.capacity;
    this.lastRefillTimestamp = Date.now();
  }

  getTimeUntilNextTokenMs(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    const tokensNeeded = 1 - this.tokens;
    const secondsNeeded = tokensNeeded / this.refillRatePerSecond;
    return Math.ceil(secondsNeeded * 1000);
  }
}

