"use strict";
// ─── M.A.I. Role-Based Access Control ────────────────────────────────────────
// Permission definitions for each role.  Uses a resource/action model where
// resource "*" is a wildcard matching every resource.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = void 0;
exports.roleAtLeast = roleAtLeast;
exports.hasPermission = hasPermission;
exports.checkUserPermission = checkUserPermission;
exports.getEffectivePermissions = getEffectivePermissions;
exports.canManageRole = canManageRole;
exports.validateScopes = validateScopes;
exports.getPermissionSummary = getPermissionSummary;
// ─── Default Permission Sets ──────────────────────────────────────────────────
/**
 * Owner has absolute control over everything.
 * This is the bootstrap/superuser role — typically only one user.
 */
const OWNER_PERMISSIONS = [
    { resource: "*", actions: ["read", "write", "execute", "admin", "delete"] },
];
/**
 * Admin can manage the system, users, and all resources,
 * but cannot delete the owner account or perform destructive system ops.
 */
const ADMIN_PERMISSIONS = [
    { resource: "*", actions: ["read", "write", "execute"] },
    { resource: "auth", actions: ["admin"] },
    { resource: "system", actions: ["admin"] },
    { resource: "users", actions: ["admin"] },
];
/**
 * Regular user can interact with chat, files, and view the HUD.
 * Cannot administer the system or other users.
 */
const USER_PERMISSIONS = [
    { resource: "chat", actions: ["read", "write"] },
    { resource: "files", actions: ["read", "write"] },
    { resource: "hud", actions: ["read"] },
    { resource: "memory", actions: ["read", "write"] },
    { resource: "skills", actions: ["read", "execute"] },
];
/**
 * Guest has read-only access to the HUD and can participate in chat.
 * Minimum trust level — useful for temporary visitors.
 */
const GUEST_PERMISSIONS = [
    { resource: "chat", actions: ["read", "write"] },
    { resource: "hud", actions: ["read"] },
];
/**
 * Complete role → permissions mapping.
 * Order matters for wildcard checks (most specific first).
 */
exports.ROLE_PERMISSIONS = {
    owner: OWNER_PERMISSIONS,
    admin: ADMIN_PERMISSIONS,
    user: USER_PERMISSIONS,
    guest: GUEST_PERMISSIONS,
};
// ─── Role Hierarchy ──────────────────────────────────────────────────────────
/**
 * Role precedence map — higher number = more privileged.
 * Used for implicit role escalation checks.
 */
const ROLE_LEVEL = {
    guest: 0,
    user: 1,
    admin: 2,
    owner: 3,
};
/**
 * Check whether `actorRole` has equal or higher privilege than `targetRole`.
 */
function roleAtLeast(actorRole, targetRole) {
    return ROLE_LEVEL[actorRole] >= ROLE_LEVEL[targetRole];
}
// ─── Permission Checking ─────────────────────────────────────────────────────
/**
 * Check if a given role has a specific permission.
 *
 * @param role    The user's role.
 * @param resource  The resource being accessed (e.g. "chat", "system").
 * @param action     The action being performed (e.g. "read", "admin").
 * @returns true if the permission is granted.
 */
function hasPermission(role, resource, action) {
    const perms = exports.ROLE_PERMISSIONS[role];
    if (!perms)
        return false;
    for (const perm of perms) {
        // Check if the resource matches
        const resourceMatch = perm.resource === "*" || perm.resource === resource;
        if (!resourceMatch)
            continue;
        // Check if the action is allowed
        if (perm.actions.includes("*") || perm.actions.includes(action)) {
            return true;
        }
    }
    return false;
}
/**
 * Check permissions for a User object (convenience wrapper).
 */
function checkUserPermission(user, resource, action) {
    if (!user.active)
        return false;
    return hasPermission(user.role, resource, action);
}
/**
 * Get all permissions for a given role.
 * Returns a flat list of { resource, action } tuples for easy inspection.
 */
function getEffectivePermissions(role) {
    const perms = exports.ROLE_PERMISSIONS[role];
    if (!perms)
        return [];
    const result = [];
    for (const perm of perms) {
        for (const action of perm.actions) {
            result.push({ resource: perm.resource, action });
        }
    }
    return result;
}
/**
 * Check if a role can manage another role.
 * A role can manage users of equal or lower privilege.
 * Owners can manage everyone including admins.
 * Admins cannot manage owners.
 */
function canManageRole(actorRole, targetRole) {
    // Nobody can manage an owner except the owner themselves
    if (targetRole === "owner") {
        return actorRole === "owner";
    }
    return roleAtLeast(actorRole, targetRole);
}
/**
 * Validate that a list of scopes (from a token) are all within
 * the permissions granted by a role.
 *
 * @returns true if all requested scopes are permitted.
 */
function validateScopes(role, scopes) {
    for (const scope of scopes) {
        // Scopes are formatted as "resource:action" or just "resource" (implies read)
        const parts = scope.split(":");
        const resource = parts[0];
        const action = parts[1] ?? "read";
        if (!hasPermission(role, resource, action)) {
            return false;
        }
    }
    return true;
}
/**
 * Get a summary of all roles and their effective permissions.
 * Useful for admin UI / debugging.
 */
function getPermissionSummary() {
    const summary = {};
    for (const role of ["owner", "admin", "user", "guest"]) {
        summary[role] = exports.ROLE_PERMISSIONS[role].map((p) => ({
            resource: p.resource,
            actions: [...p.actions],
        }));
    }
    return summary;
}
//# sourceMappingURL=permissions.js.map