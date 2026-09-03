import type { RolePermissions, UserRole, User } from "./types.js";
/**
 * Complete role → permissions mapping.
 * Order matters for wildcard checks (most specific first).
 */
export declare const ROLE_PERMISSIONS: RolePermissions;
/**
 * Check whether `actorRole` has equal or higher privilege than `targetRole`.
 */
export declare function roleAtLeast(actorRole: UserRole, targetRole: UserRole): boolean;
/**
 * Check if a given role has a specific permission.
 *
 * @param role    The user's role.
 * @param resource  The resource being accessed (e.g. "chat", "system").
 * @param action     The action being performed (e.g. "read", "admin").
 * @returns true if the permission is granted.
 */
export declare function hasPermission(role: UserRole, resource: string, action: string): boolean;
/**
 * Check permissions for a User object (convenience wrapper).
 */
export declare function checkUserPermission(user: User, resource: string, action: string): boolean;
/**
 * Get all permissions for a given role.
 * Returns a flat list of { resource, action } tuples for easy inspection.
 */
export declare function getEffectivePermissions(role: UserRole): Array<{
    resource: string;
    action: string;
}>;
/**
 * Check if a role can manage another role.
 * A role can manage users of equal or lower privilege.
 * Owners can manage everyone including admins.
 * Admins cannot manage owners.
 */
export declare function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean;
/**
 * Validate that a list of scopes (from a token) are all within
 * the permissions granted by a role.
 *
 * @returns true if all requested scopes are permitted.
 */
export declare function validateScopes(role: UserRole, scopes: string[]): boolean;
/**
 * Get a summary of all roles and their effective permissions.
 * Useful for admin UI / debugging.
 */
export declare function getPermissionSummary(): Record<UserRole, Array<{
    resource: string;
    actions: string[];
}>>;
//# sourceMappingURL=permissions.d.ts.map