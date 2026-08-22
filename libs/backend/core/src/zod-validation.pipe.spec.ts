import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({ email: z.email(), age: z.number().int().positive() });
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value when validation succeeds', () => {
    const input = { email: 'a@b.com', age: 30 };
    expect(pipe.transform(input)).toEqual(input);
  });

  it('throws BadRequestException with per-field issues when validation fails', () => {
    try {
      pipe.transform({ email: 'not-an-email', age: -1 });
      throw new Error('expected transform to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        code: string;
        issues: { path: string }[];
      };
      expect(response.code).toBe('VALIDATION_ERROR');
      expect(response.issues.map((i) => i.path)).toEqual(
        expect.arrayContaining(['email', 'age']),
      );
    }
  });
});
