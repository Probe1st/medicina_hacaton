import { test, expect } from "@playwright/test";

test.describe("Safety, privacy, and error recovery", () => {
  test("corrupted storage triggers memory-only banner and preserves other keys on reset", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.localStorage.setItem("marshrut.demo.v1", "{broken-json");
      window.localStorage.setItem("other-app-key", "keep-me");
    });

    const page = await context.newPage();
    await page.goto("/#/");

    // Check memory-only / corruption warning banner
    await expect(page.locator("body")).toContainText("Сохранённое учебное состояние повреждено");

    // Open plan in memory
    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await expect(page.locator("body")).toContainText("Выполнено 0 из 4");

    // Go to /about and reset
    await page.locator('a[href="#/about"]').click();
    await page.getByRole("button", { name: /Сбросить данные/i }).click();
    await page.getByRole("button", { name: "Да, сбросить всё" }).click();

    // Verify redirected home and storage cleared
    await expect(page).toHaveURL(/#\/$/);

    const keys = await page.evaluate(() => ({
      demo: window.localStorage.getItem("marshrut.demo.v1"),
      other: window.localStorage.getItem("other-app-key"),
    }));

    expect(keys.demo).toBeNull();
    expect(keys.other).toBe("keep-me");

    await context.close();
  });

  test("quota exceeded error handled gracefully without crash", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const origSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, val: string) {
        if (key === "marshrut.demo.v1") {
          const err = new Error("QuotaExceededError");
          err.name = "QuotaExceededError";
          throw err;
        }
        return origSet.apply(this, [key, val]);
      };
    });

    const page = await context.newPage();
    await page.goto("/#/");

    // Open plan and perform task action
    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await page.locator('a[href="#/plan/orvi-demo/task/read"]').first().click();
    await page.getByRole("button", { name: "Отметить как выполненное" }).click();

    // Warning is displayed
    await expect(page.locator("body")).toContainText("Изменения сохраняются только до закрытия страницы");

    await context.close();
  });

  test("safe handling of invalid and unknown routes", async ({ page }) => {
    // Info task on barrier URL
    await page.goto("/#/plan/orvi-demo/task/read/barrier");
    await expect(page.locator("body")).toContainText("У этой учебной задачи нет организационных препятствий");

    // Completely unknown route
    await page.goto("/#/random-unknown-page-route");
    await expect(page.locator("body")).toContainText("Страница не найдена");
    await page.getByRole("link", { name: /Вернуться к выбору/i }).click();
    await expect(page).toHaveURL(/#\/$/);
  });

  test("privacy: no external network requests during app usage", async ({ page }) => {
    const externalRequests: string[] = [];

    page.on("request", (req) => {
      const url = new URL(req.url());
      // Requests to current app host are fine
      if (url.origin !== "http://127.0.0.1:4173" && url.origin !== "http://localhost:4173") {
        externalRequests.push(req.url());
      }
    });

    await page.goto("/#/");
    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await page.locator('a[href="#/plan/orvi-demo/faq"]').first().click();

    // Click «Моего вопроса нет в списке»
    await page.getByRole("button", { name: "Моего вопроса нет в списке" }).click();
    await expect(page.locator("body")).toContainText("В этой учебной памятке нет ответа");

    // Click medical FAQ
    await page.getByRole("button", { name: /Можно изменить назначения/i }).click();
    await expect(page.locator("body")).toContainText("Приложение не оценивает симптомы");

    // Verify zero external network requests
    expect(externalRequests).toEqual([]);
  });
});
