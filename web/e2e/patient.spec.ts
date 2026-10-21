import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import { createTestUser, loginViaUi } from "./auth.fixture";

test.describe("Patient journey, reminders, issue and quiz", () => {
  test("patient flow: complete tasks, handle barrier and check insights", async ({ page }) => {
    const { user, password } = await createTestUser("patient", "patient_flow");
    await loginViaUi(page, user.username, password);

    // Click on «После ОРВИ — учебная памятка»
    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await expect(page.locator("body")).toContainText("Выполнено 0 из 4");

    // Click on first task «Прочитать памятку»
    await page.locator('a[href="#/plan/orvi-demo/task/read"]').first().click();
    await expect(page.locator("h1")).toContainText("Прочитать памятку");

    // Click «Отметить как выполненное»
    await page.getByRole("button", { name: "Отметить как выполненное" }).click();
    await expect(page.getByRole("button", { name: "Отменить отметку о выполнении" })).toBeVisible();

    // Go back to plan
    await page.locator('a[href="#/plan/orvi-demo"]').first().click();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // Reload page -> verify persistence
    await page.reload();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // Open second task «Уточнить канал для вопросов»
    await page.locator('a[href="#/plan/orvi-demo/task/contact"]').first().click();
    await expect(page.locator("h1")).toContainText("Уточнить канал для вопросов");

    // Click «Не получается»
    await page.getByRole("link", { name: "Не получается" }).click();
    await expect(page.locator("h1")).toContainText("Уточнить канал для вопросов");
    await expect(page.locator("body")).toContainText("Что именно не получается?");

    // Select «Не понимаю порядок»
    await page.getByRole("button", { name: "Не понимаю порядок" }).click();
    await expect(page.locator("body")).toContainText("Запросить порядок действий");

    // Click «Жду ответа»
    await page.getByRole("button", { name: /Жду ответа/i }).click();

    // Verify progress remains 1 из 4
    await page.locator('a[href="#/plan/orvi-demo/task/contact"]').first().click();
    await page.locator('a[href="#/plan/orvi-demo"]').first().click();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // Return to barrier page and resolve it
    await page.locator('a[href="#/plan/orvi-demo/task/contact"]').first().click();
    await page.getByRole("link", { name: /Управление препятствием|Не получается/i }).click();
    await page.getByRole("button", { name: /Получилось/i }).click();

    // Status changes to resolved, return to task
    await page.locator('a[href="#/plan/orvi-demo/task/contact"]').first().click();
    await page.locator('a[href="#/plan/orvi-demo"]').first().click();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // Complete contact task
    await page.locator('a[href="#/plan/orvi-demo/task/contact"]').first().click();
    await page.getByRole("button", { name: "Отметить как выполненное" }).click();

    // Progress becomes 2 из 4
    await page.locator('a[href="#/plan/orvi-demo"]').first().click();
    await expect(page.locator("body")).toContainText("Выполнено 2 из 4");

    // Go to #/insights
    await page.locator('a[href="#/insights"]').click();
    await expect(page.locator("body")).toContainText("2 из 4");
    await expect(page.locator("body")).toContainText("Текущих препятствий");
    await expect(page.locator("body")).toContainText("Удалось решить");
  });

  test("reminder and .ics calendar export", async ({ page }) => {
    await page.goto("/#/plan/orvi-demo/task/followup");

    // Form datetime-local has a default value (+30m)
    const input = page.locator('input[type="datetime-local"]');
    await expect(input).toBeVisible();

    // Click «Сохранить напоминание»
    await page.getByRole("button", { name: "Сохранить напоминание" }).click();
    await expect(page.locator("body")).toContainText("Напоминание установлено на:");

    // Click «Добавить в календарь (.ics)» and catch download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Добавить в календарь/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("marshrut-orvi-demo-followup.ics");
    const path = await download.path();
    expect(path).not.toBeNull();
    const content = fs.readFileSync(path!, "utf-8");
    expect(content).toContain("BEGIN:VCALENDAR");
    expect(content).toContain("SUMMARY:Учебное напоминание");
  });

  test("issue template and plan independence", async ({ page, browser }) => {
    const { user, password } = await createTestUser("staff", "staff_issue");
    await loginViaUi(page, user.username, password);

    await page.goto("/#/issue");
    await page.getByRole("button", { name: "После вакцинации" }).click();
    await page.getByRole("button", { name: "Сформировать памятку" }).click();

    const linkInput = page.locator("#share-link-input");
    await expect(linkInput).toBeVisible();
    const shareLink = await linkInput.inputValue();
    expect(shareLink).toContain("#/plan/vaccine-demo");

    // Open link in fresh browser context (guest)
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(shareLink);

    await expect(freshPage.locator("body")).toContainText("После прививки");
    await expect(freshPage.locator("body")).toContainText("Выполнено 0 из 4");

    // Return to main page in fresh context, verify orvi-demo is not started
    await freshPage.locator('a[href="#/"]').first().click();
    await expect(freshPage.locator("body")).not.toContainText("Выполнено 2 из 4");

    await freshContext.close();
  });

  test("quiz answers and first attempt recording", async ({ page }) => {
    const { user, password } = await createTestUser("patient", "patient_quiz");
    await loginViaUi(page, user.username, password);

    await page.goto("/#/plan/orvi-demo/faq");

    // Answer incorrect option first
    await page.getByRole("button", { name: "Самостоятельно изменить назначения" }).click();
    await expect(page.locator("body")).toContainText("Эта памятка не меняет назначения и не оценивает здоровье");

    // Answer correct option second
    await page.getByRole("button", { name: "Отметить препятствие и запросить организационное разъяснение" }).click();
    await expect(page.locator("body")).toContainText("Да. Здесь отмечаются организационные действия");

    // Check insights: first attempt recorded as incorrect (0 из 1)
    await page.goto("/#/insights");
    await expect(page.locator("body")).toContainText("0 из 1 верно");
  });
});
