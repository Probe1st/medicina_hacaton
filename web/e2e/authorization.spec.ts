import { test, expect } from "@playwright/test";
import { createTestUser, loginViaUi } from "./auth.fixture";

test.describe("Role-based authorization and resource protection E2E", () => {
  test("guest visiting #/issue is redirected to login with explanation", async ({ page }) => {
    await page.goto("/#/issue");
    await expect(page.locator("body")).toContainText("Выдача памятки доступна сотрудникам");
    await expect(page.locator("body")).toContainText("Учебный логин");
  });

  test("patient visiting #/issue sees ForbiddenPage", async ({ page }) => {
    const { user, password } = await createTestUser("patient", "patient_guard");
    await loginViaUi(page, user.username, password);

    await page.goto("/#/issue");
    await expect(page.locator("h1")).toContainText("Нет доступа");
    await expect(page.locator("body")).toContainText("Выдача памятки доступна только сотрудникам");
  });

  test("staff visiting #/issue can issue template and share link in clean guest context", async ({
    page,
    browser,
  }) => {
    const { user, password } = await createTestUser("staff", "staff_guard");
    await loginViaUi(page, user.username, password);

    await page.goto("/#/issue");
    await expect(page.locator("h1")).toContainText("Выдать памятку");

    // Click "Сформировать памятку"
    await page.getByRole("button", { name: "Сформировать памятку" }).click();

    // Link input should be populated with generic URL
    const input = page.locator("#share-link-input");
    await expect(input).toBeVisible();
    const shareLink = await input.inputValue();
    expect(shareLink).toContain("#/plan/orvi-demo");

    // Open link in a fresh context (guest)
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(shareLink);

    // Guest sees the public template, not staff UI
    await expect(freshPage.locator("body")).toContainText("После ОРВИ — учебная памятка");
    await expect(freshPage.locator(".header-nav")).toContainText("Войти");

    await freshContext.close();
  });

  test("insights page is accessible only with account and isolates event log", async ({
    page,
  }) => {
    // 1. Guest visits #/insights -> redirected to login
    await page.goto("/#/insights");
    await expect(page.locator("body")).toContainText("Журнал и карта препятствий доступны в учебном аккаунте");

    // 2. Patient visits #/insights -> sees own account data
    const { user, password } = await createTestUser("patient", "patient_ins");
    await loginViaUi(page, user.username, password);

    await page.goto("/#/insights");
    await expect(page.locator("h1")).toContainText("Карта препятствий");
    await expect(page.locator("body")).toContainText("Учебные данные этого аккаунта");
  });
});
