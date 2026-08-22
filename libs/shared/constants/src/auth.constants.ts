/**
 * Fixed auth values — the single source of truth referenced by both the
 * zod schemas (@eos/contracts) and the services that enforce them
 * (@eos/auth). Change a number once, here.
 */
export const AUTH = {
  /** Access JWT lifetime, in seconds (docs/01 FR-AUTH-03). */
  ACCESS_TOKEN_TTL_SECONDS: 15 * 60,
  /** Refresh token lifetime, in seconds. */
  REFRESH_TOKEN_TTL_SECONDS: 30 * 24 * 60 * 60,
  /** Minimum password length enforced at signup. */
  PASSWORD_MIN_LENGTH: 12,
} as const;
