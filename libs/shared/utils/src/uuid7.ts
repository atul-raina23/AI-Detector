import { randomBytes } from 'node:crypto';

/**
 * Generates a UUIDv7 (RFC 9562): a 48-bit millisecond timestamp followed by
 * random bits, so ids sort by creation time — good for PKs and indexes
 * (docs/04 §9). No third-party dependency: Node's `crypto.randomUUID()`
 * only produces v4, so this is a small, fully-owned implementation instead
 * of pulling in a package purely for one function.
 */
export function uuid7(): string {
  const unixMs = BigInt(Date.now());
  const rand = randomBytes(10);

  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(Number(unixMs & 0xffffffffffffn), 0, 6);
  rand.copy(bytes, 6);

  bytes[6] = 0x70 | (bytes[6] & 0x0f); // version 7
  bytes[8] = 0x80 | (bytes[8] & 0x3f); // variant 10

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
