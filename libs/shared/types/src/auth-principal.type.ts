/**
 * The authenticated caller, resolved from a validated access token
 * (docs/03 §9 "Tenant context"). Every RBAC/tenant-scoping decision starts
 * from this — never from a client-supplied organization id.
 */
export interface AuthPrincipal {
  userId: string;
  organizationId: string;
  email: string;
}
