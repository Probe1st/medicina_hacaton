import { describe, expect, it } from "vitest";
import { AuthError, hasPermission, requirePermission } from "../src/auth/policy";
import type { Principal } from "../src/auth/sessions";

describe("Authorization policy and role permissions", () => {
  const patientPrincipal: Principal = {
    user: {
      id: "u-patient",
      username: "patient_one",
      role: "patient",
    },
    tokenHash: "hash1",
    csrfToken: "csrf1",
    expiresAt: Date.now() + 10000,
  };

  const staffPrincipal: Principal = {
    user: {
      id: "u-staff",
      username: "staff_one",
      role: "staff",
    },
    tokenHash: "hash2",
    csrfToken: "csrf2",
    expiresAt: Date.now() + 10000,
  };

  it("assigns exact permissions to patient role", () => {
    expect(hasPermission("patient", "state:read:self")).toBe(true);
    expect(hasPermission("patient", "state:write:self")).toBe(true);
    expect(hasPermission("patient", "state:reset:self")).toBe(true);
    expect(hasPermission("patient", "template:issue")).toBe(false);
  });

  it("assigns exact permissions to staff role", () => {
    expect(hasPermission("staff", "state:read:self")).toBe(true);
    expect(hasPermission("staff", "state:write:self")).toBe(true);
    expect(hasPermission("staff", "state:reset:self")).toBe(true);
    expect(hasPermission("staff", "template:issue")).toBe(true);
  });

  it("throws 401 AUTH_REQUIRED when principal is null", () => {
    expect(() => requirePermission(null, "state:read:self")).toThrowError(AuthError);
    try {
      requirePermission(null, "state:read:self");
    } catch (err) {
      const e = err as AuthError;
      expect(e.statusCode).toBe(401);
      expect(e.code).toBe("AUTH_REQUIRED");
    }
  });

  it("throws 403 FORBIDDEN when patient attempts template:issue", () => {
    expect(() => requirePermission(patientPrincipal, "template:issue")).toThrowError(AuthError);
    try {
      requirePermission(patientPrincipal, "template:issue");
    } catch (err) {
      const e = err as AuthError;
      expect(e.statusCode).toBe(403);
      expect(e.code).toBe("FORBIDDEN");
    }
  });

  it("allows staff to perform template:issue", () => {
    expect(() => requirePermission(staffPrincipal, "template:issue")).not.toThrow();
  });
});
