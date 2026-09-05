/**
 * Role-Based Permissions Helper
 * Validates user permissions and role hierarchies for feature access.
 */

export type UserRole = 'admin' | 'manager' | 'developer' | 'viewer';

export interface UserContext {
  id: string;
  role: UserRole;
  permissions: string[];
}

export function hasPermission(user: UserContext, requiredPermission: string): boolean {
  if (user.role === 'admin') return true;
  return user.permissions.includes(requiredPermission);
}

export function hasAnyPermission(user: UserContext, requiredPermissions: string[]): boolean {
  if (user.role === 'admin') return true;
  return requiredPermissions.some((perm) => user.permissions.includes(perm));
}

export function hasAllPermissions(user: UserContext, requiredPermissions: string[]): boolean {
  if (user.role === 'admin') return true;
  return requiredPermissions.every((perm) => user.permissions.includes(perm));
}

const ROLE_RANK: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  developer: 2,
  viewer: 1,
};

export function isRoleHigherOrEqual(userRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[targetRole];
}

export function canManageMembers(user: UserContext): boolean {
  return isRoleHigherOrEqual(user.role, 'manager');
}

export function canDeleteResource(user: UserContext, resourceOwnerId: string): boolean {
  if (user.role === 'admin') return true;
  return user.id === resourceOwnerId;
}

