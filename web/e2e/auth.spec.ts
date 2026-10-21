import { test, expect } from "@playwright/test";
import { createTestUser, loginViaUi } from "./auth.fixture";

test.describe("Authentication and session lifecycle E2E", () => {
  test("User A completes tasks, reloads, logs out; User B sees clean state; User A sees persisted state", async ({
    page,
  }) => {
    const { user: userA, password: pwdA } = await createTestUser("patient", "patient_a");
    const { user: userB, password: pwdB } = await createTestUser("patient", "patient_b");

    // 1. User A logs in
    await loginViaUi(page, userA.username, pwdA);
    await expect(page.locator(".header-nav")).toContainText(userA.username);

    // 2. User A opens plan and completes first task
    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await page.locator('a[href="#/plan/orvi-demo/task/read"]').first().click();
    await page.getByRole("button", { name: "Отметить как выполненное" }).click();
    await page.locator('a[href="#/plan/orvi-demo"]').first().click();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // 3. Reload page -> verify persistence
    await page.reload();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");
    await expect(page.locator(".header-nav")).toContainText(userA.username);

    // 4. Logout
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/#\/login/);

    // 5. User B logs in
    await page.fill("#login-username", userB.username);
    await page.fill("#login-password", pwdB);
    await page.click("button[type='submit']");
    await expect(page.locator(".header-nav")).toContainText(userB.username);

    // User B opens orvi-demo -> 0 of 4 done
    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await expect(page.locator("body")).toContainText("Выполнено 0 из 4");

    // 6. Logout B and log back in as A -> 1 of 4 restored
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.fill("#login-username", userA.username);
    await page.fill("#login-password", pwdA);
    await page.click("button[type='submit']");
    await expect(page.locator(".header-nav")).toContainText(userA.username);

    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");
  });

  test("multi-tab session change notification hides UI in other tabs", async ({
    context,
  }) => {
    const { user: userA, password: pwdA } = await createTestUser("patient", "patient_tab");

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Login on page 1
    await loginViaUi(page1, userA.username, pwdA);
    await expect(page1.locator(".header-nav")).toContainText(userA.username);

    // Page 2 navigates to home -> should recognize active session
    await page2.goto("/#/");
    await expect(page2.locator(".header-nav")).toContainText(userA.username);

    // Page 1 logs out
    await page1.getByRole("button", { name: "Выйти" }).click();
    await expect(page1).toHaveURL(/#\/login/);

    // Page 2 should react to broadcast / session check and close private UI
    await expect(page2.locator(".header-nav")).not.toContainText(userA.username);

    await page1.close();
    await page2.close();
  });
});
