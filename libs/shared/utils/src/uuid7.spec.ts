import { uuid7 } from './uuid7.js';

describe('uuid7', () => {
  it('produces a well-formed UUID with version 7 and variant bits set', () => {
    const id = uuid7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sorts lexicographically by creation time (time-ordered PK property)', async () => {
    const first = uuid7();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = uuid7();
    expect(first < second).toBe(true);
  });

  it('never collides across many rapid calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuid7()));
    expect(ids.size).toBe(1000);
  });
});
