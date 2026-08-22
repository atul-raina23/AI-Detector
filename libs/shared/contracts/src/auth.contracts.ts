import { z } from 'zod';
import { AUTH } from '@eos/shared-constants';

/**
 * Wire contracts for the auth surface (docs/05 API design, docs/01
 * FR-AUTH-*). Shared verbatim between the NestJS controller (request
 * validation) and the React client (response typing) — no drift.
 */

export const SignupRequestSchema = z.object({
  organizationName: z.string().min(2).max(200),
  organizationSlug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, and hyphens only'),
  name: z.string().min(1).max(200),
  email: z.email().max(320),
  password: z.string().min(AUTH.PASSWORD_MIN_LENGTH).max(200),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  organizationSlug: z.string().min(2).max(100),
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(20),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  email: z.email(),
  name: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthTokensResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
  user: AuthUserSchema,
});
export type AuthTokensResponse = z.infer<typeof AuthTokensResponseSchema>;
