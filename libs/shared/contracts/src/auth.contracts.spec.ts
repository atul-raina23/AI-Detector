import {
  LoginRequestSchema,
  SignupRequestSchema,
} from './auth.contracts.js';

describe('SignupRequestSchema', () => {
  const valid = {
    organizationName: 'Acme Inc',
    organizationSlug: 'acme-inc',
    name: 'Ada Lovelace',
    email: 'ada@acme.test',
    password: 'correct-horse-battery',
  };

  it('accepts a well-formed signup payload', () => {
    expect(SignupRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a password shorter than the shared AUTH.PASSWORD_MIN_LENGTH', () => {
    const result = SignupRequestSchema.safeParse({ ...valid, password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects an organizationSlug with uppercase or invalid characters', () => {
    const result = SignupRequestSchema.safeParse({
      ...valid,
      organizationSlug: 'Acme Inc!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed email', () => {
    const result = SignupRequestSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });
});

describe('LoginRequestSchema', () => {
  it('accepts organizationSlug + email + any non-empty password', () => {
    const result = LoginRequestSchema.safeParse({
      organizationSlug: 'acme-inc',
      email: 'ada@acme.test',
      password: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = LoginRequestSchema.safeParse({
      organizationSlug: 'acme-inc',
      email: 'ada@acme.test',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});
