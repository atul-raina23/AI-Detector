import { createHash, randomBytes } from 'node:crypto';

/** A fresh opaque refresh token — high-entropy, never stored raw (docs/06). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest — what actually gets stored in `refresh_tokens.token_hash`. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}
