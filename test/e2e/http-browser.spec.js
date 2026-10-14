import { test, expect } from "@playwright/test";
import { localInput } from "../../src/domain/time.js";

test("HTTP LAN browser can create, save, sync and submit a daily bore record without secure-context crypto APIs", async ({ playwright }) => {
  const browser = await playwright.chromium.launch({ args: ["--no-proxy-server", "--host-resolver-rules=MAP jobs-http.test 127.0.0.1"] });
  try {
    const context = await browser.newContext({ baseURL: "http://jobs-http.test:18080", viewport: { width: 390, height: 844 } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    expect(await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID, subtle: typeof crypto.subtle, random: typeof crypto.getRandomValues }))).toEqual({ secure: false, uuid: "undefined", subtle: "undefined", random: "function" });
    await page.getByLabel("Username or email").fill("localdriller");
    await page.getByLabel("Password", { exact: true }).fill("TestPassword123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: /Local integration job/ }).click();
    await page.getByLabel("Shift start").fill(localInput(new Date(Date.now() - 3 * 3600000).toISOString()));
    await page.getByLabel("Starting point").selectOption("BH5049");
    await page.getByRole("button", { name: "Start daily record" }).click();
    await expect(page.getByRole("heading", { name: "Daily log", exact: true })).toBeVisible();
    await page.getByLabel("Core boxes", { exact: true }).fill("3");
    await page.getByLabel("Daily comments").fill("HTTP browser crypto regression");
    await page.getByRole("button", { name: "End shift now", exact: true }).click();
    await page.getByLabel("Shift finish").fill(localInput(new Date(Date.now() - 3600000).toISOString()));
    await page.getByLabel("Finishing depth").fill("12");
    await page.getByRole("button", { name: "End shift and save", exact: true }).click();
    await page.getByRole("button", { name: "Review completed shift", exact: true }).click();
    await expect(page.getByText("Field entry is complete and ready for submission.")).toBeVisible();
    await page.getByRole("button", { name: "Submit daily log", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Submitted daily log", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
