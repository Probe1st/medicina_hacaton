import type { UserRole } from "../accounts";
import type { Principal } from "./sessions";

export type Permission =
  | "state:read:self"
  | "state:write:self"
  | "state:reset:self"
  | "template:issue";

const ROLE_PERMISSIONS: Record<UserRole, Record<Permission, true>> = {
  patient: {
    "state:read:self": true,
    "state:write:self": true,
    "state:reset:self": true,
  } as Record<Permission, true>,
  staff: {
    "state:read:self": true,
    "state:write:self": true,
    "state:reset:self": true,
    "template:issue": true,
  },
};

export class AuthError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return Boolean(ROLE_PERMISSIONS[role]?.[permission]);
}

export function requirePermission(
  principal: Principal | null,
  permission: Permission
): asserts principal is Principal {
  if (!principal) {
    throw new AuthError(401, "AUTH_REQUIRED", "Требуется авторизация");
  }

  if (!hasPermission(principal.user.role, permission)) {
    throw new AuthError(403, "FORBIDDEN", "Недостаточно прав для выполнения операции");
  }
}
