import { test, expect } from "@playwright/test";
import { localInput } from "../../src/domain/time.js";

const time = hoursAgo => localInput(new Date(Date.now() - hoursAgo * 3600000).toISOString());
async function records(page) {
  return page.evaluate(() => new Promise(resolve => {
    const r = indexedDB.open("substrata-jobs");
    r.onsuccess = () => { const db = r.result, q = db.transaction("dailyLogs").objectStore("dailyLogs").getAll(); q.onsuccess = () => { db.close(); resolve(q.result); }; };
  }));
}
test("paper-based daily entry saves bore details, work descriptions, readings and quantities offline and syncs them", async ({ page, context }) => {
  await page.goto("/"); await page.getByLabel("Username or email").fill("localdriller"); await page.getByLabel("Password").fill("TestPassword123!"); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: /Local integration job/ }).click();
  await page.getByLabel("Shift start").fill(time(8)); await page.getByLabel("Starting point").selectOption("BH5049");
  await context.setOffline(true); await page.getByRole("button", { name: "Start daily record" }).click();
  await expect(page.getByRole("heading", { name: "Daily log", exact: true })).toBeVisible();
  await page.getByLabel("Consultant", { exact: true }).fill("Local Test Consultant");
  await page.getByLabel("Bore size", { exact: true }).fill("HQ"); await page.getByLabel("Purpose of bore").fill("Ground investigation");
  await page.getByLabel("Starting bore depth").fill("0"); await page.getByLabel("Current bore depth").fill("15");
  await page.getByLabel("AM depth to water").fill("2.2"); await page.getByLabel("AM bore depth").fill("15");
  await page.getByLabel("Water meter serial").fill("WM-TEST-1"); await page.getByLabel("Meter start reading").fill("100"); await page.getByLabel("Meter finish reading").fill("350");
  await expect(page.getByText("Water used: 250 L", { exact: true })).toBeVisible();
  await page.getByLabel("Bentonite powder / pellets").fill("1"); await page.getByLabel("Core boxes", { exact: true }).fill("4"); await page.getByLabel("SPT test", { exact: true }).fill("5");
  await page.getByLabel("Vac extraction", { exact: true }).selectOption("0");
  await page.getByLabel("Daily comments").fill("Daily sheet acceptance record");
  await page.locator(".work-entry textarea").first().fill("Prepare rig and load equipment");
  await expect.poll(async () => (await records(page)).find(log => log.notes === "Daily sheet acceptance record")?.points[0].dailyDetails.waterMeterFinish).toBe(350);
  const id = (await records(page)).find(log => log.notes === "Daily sheet acceptance record").id;
  await page.reload(); await expect(page.getByLabel("AM depth to water")).toHaveValue("2.2"); await expect(page.getByLabel("Core boxes", { exact: true })).toHaveValue("4");
  await page.getByRole("button", { name: "Next work entry", exact: true }).click(); await page.getByLabel("Next activity starts").fill(time(7)); await page.getByLabel("Work category").selectOption("GT_ROTARY_SONIC"); await page.getByLabel("Work description").fill("Drill HQ with SPTs"); await page.getByRole("button", { name: "Save next work entry" }).click();
  await page.getByRole("button", { name: /CURRENT POINT BH5049/ }).click(); await page.getByLabel("Point change time").fill(time(4)); await page.getByLabel("Finishing depth").fill("15"); await page.getByLabel("Next point").selectOption("BH5050"); await page.getByRole("button", { name: "Change point and save" }).click();
  await page.getByRole("group", { name: "Bores on this daily log" }).getByRole("button", { name: "BH5050", exact: true }).click();
  await expect(page.getByLabel("AM depth to water")).toHaveValue(""); await expect(page.getByLabel("Core boxes", { exact: true })).toHaveValue("");
  await page.getByLabel("Core boxes", { exact: true }).fill("2");
  await page.getByRole("group", { name: "Bores on this daily log" }).getByRole("button", { name: "BH5049", exact: true }).click(); await expect(page.getByLabel("Core boxes", { exact: true })).toHaveValue("4");
  await page.getByRole("button", { name: "Edit depth / status" }).click(); await page.getByLabel("Finishing depth (m)", { exact: true }).fill("16"); await page.getByRole("button", { name: "Save point progress" }).click();
  await expect(page.getByLabel("Finishing bore depth")).toHaveValue("16");
  await page.locator(".work-entry-time").first().click(); await page.getByRole("textbox", { name: "Work description", exact: true }).fill("Prepare rig and load equipment; complete site checks"); await page.getByRole("button", { name: "Save work entry", exact: true }).click();
  await expect(page.locator(".work-entry textarea").first()).toHaveValue("Prepare rig and load equipment; complete site checks");
  await context.setOffline(false); await page.locator(".sync-chip").click(); await page.getByRole("button", { name: "Sync now", exact: true }).click(); await expect(page.locator(".sync-chip")).toHaveText("Synced"); await page.getByRole("button", { name: "Close", exact: true }).click();
  const response = await page.request.get(`/api/v1/daily-logs/${id}`); expect(response.ok()).toBeTruthy(); const server = (await response.json()).log;
  expect(server.points[0].dailyDetails).toMatchObject({ boreSize: "HQ", purpose: "Ground investigation", waterLevelAm: 2.2, waterLevelBoreDepthAm: 15, waterMeterSerial: "WM-TEST-1", waterMeterStart: 100, waterMeterFinish: 350 });
  expect(server.items.filter(i => i.itemLabelSnapshot === "Core boxes").map(i => i.quantity).sort()).toEqual([2, 4]);
  await page.getByRole("button", { name: "Daily log", exact: true }).click();
  await page.locator(".active-screen").evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: "test-results/daily-sheet-mobile.png" });
  await page.getByRole("navigation", { name: "Daily log sections" }).getByRole("button", { name: "Work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Work details", exact: true })).toBeInViewport();
  await expect.poll(() => page.locator("#daily-part-2").evaluate(element => Math.abs(element.getBoundingClientRect().top - element.closest(".screen").getBoundingClientRect().top - 56))).toBeLessThan(3);
  await expect(page.locator(".topbar")).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "test-results/daily-sheet-work.png" });
  await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: "test-results/daily-sheet-desktop.png" });
});
