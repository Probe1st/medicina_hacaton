import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createAccount, type PublicUser, type UserRole } from "../../server/src/accounts";

function getValidatedDatabasePath(): string {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("auth.fixture can only run when NODE_ENV=test");
  }

  const e2eTempDir = process.env.E2E_TEMP_DIR;
  const databasePath = process.env.DATABASE_PATH;

  if (!e2eTempDir || !databasePath || !databasePath.startsWith(e2eTempDir)) {
    throw new Error(`Invalid or insecure test database configuration: ${databasePath}`);
  }

  return databasePath;
}

export async function createTestUser(
  role: UserRole = "patient",
  prefix = "testuser"
): Promise<{ user: PublicUser; password: string }> {
  const databasePath = getValidatedDatabasePath();
  const uniqueName = `${prefix}_${randomUUID().replace(/[^a-z0-9]/g, "").slice(0, 8)}`;

  return createAccount({
    databasePath,
    username: uniqueName,
    role,
  });
}

export async function loginViaUi(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto("/#/login");
  await page.fill("#login-username", username);
  await page.fill("#login-password", password);
  await page.click("button[type='submit']");
  await page.waitForFunction(() => window.location.hash !== "#/login");
}
