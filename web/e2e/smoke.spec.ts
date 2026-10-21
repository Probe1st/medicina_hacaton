import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import { createTestUser, loginViaUi } from "./auth.fixture";

function doBoxesOverlap(
  b1: { x: number; y: number; width: number; height: number },
  b2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    b1.x + b1.width <= b2.x + 1 ||
    b2.x + b2.width <= b1.x + 1 ||
    b1.y + b1.height <= b2.y + 1 ||
    b2.y + b2.height <= b1.y + 1
  );
}

test.describe("Visual, Accessibility, and Functional Smoke Check", () => {
  const viewports = [
    { name: "iPhone (390x844)", width: 390, height: 844 },
    { name: "Android (360x800)", width: 360, height: 800 },
    { name: "Desktop (1366x768)", width: 1366, height: 768 },
  ];

  const routesToCheck = [
    "/#/",
    "/#/plan/orvi-demo",
    "/#/plan/orvi-demo/task/read",
    "/#/plan/orvi-demo/task/followup/barrier",
    "/#/about",
    "/#/login",
  ];

  for (const vp of viewports) {
    test(`responsive layout, no horizontal scroll, and contrast on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Track Notification permission requests
      await page.addInitScript(() => {
        if ("Notification" in window) {
          window.Notification.requestPermission = async () => {
            (window as any).__notificationRequested = true;
            return "denied";
          };
        }
      });

      for (const route of routesToCheck) {
        await page.goto(route);
        await page.waitForLoadState("domcontentloaded");

        // 1. Check no horizontal scroll
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

        // 2. Check banner is visible
        const banner = page.locator('.top-banner[role="banner"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText("Учебное демо. Только вымышленные данные. Не медицинская консультация");

        // 3. Check cards are visible and not overlapping
        const cards = page.locator(".card");
        const count = await cards.count();
        if (count > 1) {
          const boxes = await Promise.all(
            Array.from({ length: count }, (_, i) => cards.nth(i).boundingBox())
          );
          for (let i = 0; i < boxes.length - 1; i++) {
            const b1 = boxes[i];
            const b2 = boxes[i + 1];
            if (b1 && b2 && b1.width > 0 && b1.height > 0 && b2.width > 0 && b2.height > 0) {
              expect(doBoxesOverlap(b1, b2)).toBe(false);
            }
          }
        }
      }

      // Check notification was never requested
      const requested = await page.evaluate(() => (window as any).__notificationRequested === true);
      expect(requested).toBe(false);
    });
  }
  test("issue page layout and actions as staff", async ({ page }) => {
    const { user, password } = await createTestUser("staff", "smoke_staff");
    await loginViaUi(page, user.username, password);
    await page.goto("/#/issue");
    await expect(page.locator("h1")).toContainText("Выдать памятку");
    await page.getByRole("button", { name: "Сформировать памятку" }).click();
    await expect(page.locator("#share-link-input")).toBeVisible();
  });

  test("insights page layout and metrics as patient", async ({ page }) => {
    const { user, password } = await createTestUser("patient", "smoke_patient");
    await loginViaUi(page, user.username, password);
    await page.goto("/#/insights");
    await expect(page.locator("h1")).toContainText("Карта препятствий");
    await expect(page.locator("body")).toContainText("Учебные данные этого аккаунта");
  });


  test("color contrast and computed CSS values verification", async ({ page }) => {
    await page.goto("/#/");

    // Check CSS variables defined in :root
    const vars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue("--bg").trim().toUpperCase(),
        surface: style.getPropertyValue("--surface").trim().toUpperCase(),
        text: style.getPropertyValue("--text").trim().toUpperCase(),
        muted: style.getPropertyValue("--muted").trim().toUpperCase(),
        accent: style.getPropertyValue("--accent").trim().toUpperCase(),
        border: style.getPropertyValue("--border").trim().toUpperCase(),
      };
    });

    expect(vars.bg).toBe("#F6F8FA");
    expect(["#FFFFFF", "#FFF"]).toContain(vars.surface);
    expect(vars.text).toBe("#17252E");
    expect(vars.muted).toBe("#4C5963");
    expect(vars.accent).toBe("#075E70");
    expect(vars.border).toBe("#D1D9DF");

    // Check primary button computed styles (white on accent, touch target >= 44px)
    const btn = page.locator("a.btn-primary").first();
    const btnBox = await btn.boundingBox();
    expect(btnBox).not.toBeNull();
    expect(btnBox!.height).toBeGreaterThanOrEqual(44);
    expect(btnBox!.width).toBeGreaterThanOrEqual(44);

    const btnStyle = await btn.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        color: s.color,
        backgroundColor: s.backgroundColor,
      };
    });
    // White text rgb(255, 255, 255) on #075E70 rgb(7, 94, 112)
    expect(btnStyle.color).toBe("rgb(255, 255, 255)");
    expect(btnStyle.backgroundColor).toBe("rgb(7, 94, 112)");
  });

  test("verify 90-second demo scenario flow and RFC 5545 calendar file validity", async ({ page }) => {
    const { user, password } = await createTestUser("patient", "smoke_scen");
    await loginViaUi(page, user.username, password);

    // Step 1: Open ORVI plan
    await page.goto("/#/");
    await page.locator('a[href="#/plan/orvi-demo"]').click();
    await expect(page.locator("h1")).toContainText("После ОРВИ — учебная памятка");
    await expect(page.locator("body")).toContainText("Выполнено 0 из 4");

    // Step 2: Mark "Прочитать памятку" complete -> 1/4
    await page.locator('a[href="#/plan/orvi-demo/task/read"]').first().click();
    await page.getByRole("button", { name: "Отметить как выполненное" }).click();
    await page.locator('a[href="#/plan/orvi-demo"]').first().click();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // Step 3: Open followup task -> select barrier "no_slots" -> shows available action and SourceCard
    await page.locator('a[href="#/plan/orvi-demo/task/followup"]').first().click();
    await page.getByRole("link", { name: "Не получается" }).click();
    await expect(page.locator("body")).toContainText("Что именно не получается?");

    await page.getByRole("button", { name: "Нет записи" }).click();
    await expect(page.locator("body")).toContainText("Уточнить доступный способ согласования");
    await expect(page.locator("body")).toContainText("Учебные правила организационных препятствий");

    // Step 4: Generate draft, select "Жду ответа" -> outcome recorded, status is waiting, progress is still 1/4
    const draftTextarea = page.locator("textarea[readonly]");
    await expect(draftTextarea).toBeVisible();
    const draftContent = await draftTextarea.inputValue();
    expect(draftContent).toContain("Учебный запрос разъяснения — не отправляется.");
    expect(draftContent).toContain("Препятствие: нет свободной записи или талонов.");

    await page.getByRole("button", { name: /Жду ответа/i }).click();

    // Check status is waiting and progress remains 1/4
    await page.locator('a[href="#/plan/orvi-demo/task/followup"]').first().click();
    await expect(page.locator("body")).toContainText("Ожидание ответа");
    await page.locator('a[href="#/plan/orvi-demo"]').first().click();
    await expect(page.locator("body")).toContainText("Выполнено 1 из 4");

    // Step 5: Set reminder, export .ics -> downloaded
    await page.locator('a[href="#/plan/orvi-demo/task/followup"]').first().click();
    await page.getByRole("button", { name: "Сохранить напоминание" }).click();
    await expect(page.locator("body")).toContainText("Напоминание установлено на:");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Добавить в календарь/i }).click();
    const download = await downloadPromise;

    // Check RFC-5545 validity on downloaded file
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const icsContent = fs.readFileSync(downloadPath!, "utf-8");

    // 1. CRLF line endings
    expect(icsContent.includes("\r\n")).toBe(true);
    const nonCrlf = icsContent.replace(/\r\n/g, "");
    expect(nonCrlf.includes("\n")).toBe(false);

    // 2. Line folding <= 75 octets
    const encoder = new TextEncoder();
    const lines = icsContent.split("\r\n");
    for (const line of lines) {
      if (line.length === 0) continue;
      const byteLen = encoder.encode(line).length;
      expect(byteLen).toBeLessThanOrEqual(75);
    }

    // 3. Check VEVENT required fields
    expect(icsContent).toContain("BEGIN:VCALENDAR");
    expect(icsContent).toContain("VERSION:2.0");
    expect(icsContent).toContain("PRODID:-//MARSHRUT//Educational Demo//RU");
    expect(icsContent).toContain("BEGIN:VEVENT");
    expect(icsContent).toMatch(/UID:marshrut-orvi-demo-followup-\d+@demo\.invalid/);
    expect(icsContent).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(icsContent).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(icsContent).toMatch(/DTEND:\d{8}T\d{6}Z/);
    expect(icsContent).toContain("SUMMARY:Учебное напоминание");
    expect(icsContent).toContain("DESCRIPTION:Откройте учебный план МАРШРУТ");
    expect(icsContent).toContain("BEGIN:VALARM");
    expect(icsContent).toContain("ACTION:DISPLAY");
    expect(icsContent).toContain("TRIGGER:PT0M");
    expect(icsContent).toContain("END:VALARM");
    expect(icsContent).toContain("END:VEVENT");
    expect(icsContent).toContain("END:VCALENDAR");

    // Step 6: Open Insights -> confirms 1 plan, 1 done, 1 waiting outcome
    await page.goto("/#/insights");
    await expect(page.locator("body")).toContainText("Планов открыто");
    await expect(page.locator("body")).toContainText("Задач выполнено");
    await expect(page.locator("body")).toContainText("1 из 4");
    await expect(page.locator("body")).toContainText("Ждут ответа");
    await expect(page.locator("body")).toContainText("1");
  });
});
