import { test, expect } from "@playwright/test";
import { createTestUser, loginViaUi } from "./auth.fixture";

test.describe("Offline behavior and fail-closed security for accounts", () => {
  test("offline after login locks private account and offers explicit guest mode", async ({
    context,
    page,
  }) => {
    const { user, password } = await createTestUser("patient", "patient_off");

    // Login while online
    await loginViaUi(page, user.username, password);
    await expect(page.locator(".header-nav")).toContainText(user.username);

    // Wait for service worker ready
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.ready;
      }
    });

    // Go offline
    await context.setOffline(true);

    // Reload while offline
    await page.reload();

    // Account state must fail closed, displaying unavailable lock
    await expect(page.locator("body")).toContainText("Связь с сервером недоступна");
    await expect(page.locator("body")).not.toContainText(user.username);

    // Clicking "Открыть учебное демо" allows guest usage offline
    await page.getByRole("button", { name: "Открыть учебное демо" }).click();
    await expect(page.locator("body")).toContainText("Выбор учебной памятки");
    await expect(page.locator(".header-nav")).toContainText("Войти");

    // Restore network
    await context.setOffline(false);
  });

  test("offline logout leaves pending marker and requires confirmation", async ({
    context,
    page,
  }) => {
    const { user, password } = await createTestUser("patient", "patient_pen");

    await loginViaUi(page, user.username, password);
    await expect(page.locator(".header-nav")).toContainText(user.username);

    // Go to account page
    await page.goto("/#/account");

    // Go offline
    await context.setOffline(true);

    // Attempt logout while offline
    await page.getByRole("button", { name: "Выйти из аккаунта" }).click();

    // Verify logout-pending lock is shown
    await expect(page.locator("body")).toContainText("Выход не подтверждён сервером");

    // Verify localStorage has marker
    const marker = await page.evaluate(() =>
      window.localStorage.getItem("marshrut.auth.logout-pending.v1")
    );
    expect(marker).toBe("1");

    // Restore network
    await context.setOffline(false);

    // Click "Повторить выход" while online
    await page.getByRole("button", { name: "Повторить выход" }).click();

    // Once server processes logout, user is at guest or login screen and marker is removed
    await expect
      .poll(async () => {
        return page.evaluate(() =>
          window.localStorage.getItem("marshrut.auth.logout-pending.v1")
        );
      })
      .toBeNull();
  });
});
