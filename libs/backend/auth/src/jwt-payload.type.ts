/** Access-token claims (docs/01 FR-AUTH-03). Internal to the auth feature. */
export interface JwtPayload {
  sub: string; // userId
  org: string; // organizationId
  email: string;
}

export interface RequestMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}
