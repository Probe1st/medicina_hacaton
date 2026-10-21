import { test, expect } from "@playwright/test";

test.describe("Offline capabilities", () => {
  test("offline operation with service worker precache", async ({ context, page }) => {
    await page.goto("/#/");

    // Wait for service worker registration to settle
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.ready;
      }
    });

    // Reload once to ensure service worker controls the page
    await page.reload();

    // Open orvi-demo and complete first task
    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await page.locator('a[href="#/plan/orvi-demo/task/read"]').first().click();
    await page.getByRole("button", { name: "Отметить как выполненное" }).click();

    await page.locator('a[href="#/plan/orvi-demo"]').first().click();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // Disconnect network
    await context.setOffline(true);

    // Reload page in offline mode
    await page.reload();

    // If offline lock appears, explicitly enter guest demo
    const guestDemoBtn = page.getByRole("button", { name: "Открыть учебное демо" });
    if (await guestDemoBtn.isVisible()) {
      await guestDemoBtn.click();
    }

    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // Navigate to vaccine-demo while offline
    await page.locator('a[href="#/"]').first().click();
    await page.locator('a[href="#/plan/vaccine-demo"]').click();
    await expect(page.locator("body")).toContainText("После прививки");
    await expect(page.locator("body")).toContainText("Выполнено 0 из 4");

    // Open FAQ offline
    await page.locator('a[href="#/plan/vaccine-demo/faq"]').first().click();
    await expect(page.locator("h1")).toContainText("Ответы по памятке");

    // Restore network
    await context.setOffline(false);
  });
});
