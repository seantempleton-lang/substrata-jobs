import { test, expect } from "@playwright/test";
import { localInput } from "../../src/domain/time.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
function removeProfile(profile) {
  const resolved = path.resolve(profile), prefix = path.resolve(tmpdir()) + path.sep;
  if (!resolved.startsWith(prefix) || !path.basename(resolved).startsWith("substrata-jobs-browser-test-")) throw new Error("Unexpected temporary profile path");
  rmSync(resolved, { recursive: true, force: true });
}
const time = hoursAgo => localInput(new Date(Date.now() - hoursAgo * 3600000).toISOString()).replace(/:00$/, "");
async function signIn(page, username = "localdriller") {
  await page.goto("/");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("TestPassword123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your field workspace" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your field workspace" })).toBeVisible();
}
async function deviceLogs(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("substrata-jobs");
    request.onsuccess = () => { const db = request.result; const read = db.transaction("dailyLogs", "readonly").objectStore("dailyLogs").getAll(); read.onsuccess = () => { db.close(); resolve(read.result); }; read.onerror = reject; };
    request.onerror = reject;
  }));
}
async function saved(page, name) { await page.getByRole("button", { name, exact: true }).click(); await expect(page.getByRole("dialog")).toBeHidden(); }
async function sync(page) {
  await page.locator(".sync-chip").click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.locator(".sync-chip")).toHaveText("Synced", { timeout: 20000 });
  await page.getByRole("button", { name: "Close", exact: true }).click();
}

test("Geotech multi-point log survives offline reload, crew changes, items, handover and sync", async ({ page, context }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await signIn(page);
  await page.getByRole("button", { name: /Local integration job/ }).click();
  await page.getByLabel("Shift start").fill(time(8));
  await page.getByLabel("Starting point").selectOption("BH5049");
  await page.getByLabel("Starting depth").fill("0");
  await page.getByLabel("Bore size").fill("150 mm");
  const existingIds = (await deviceLogs(page)).map(log => log.id);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Start daily record" }).click();
  await expect(page.getByRole("heading", { name: "Job 302670", exact: true })).toBeVisible();
  await expect.poll(async () => (await deviceLogs(page)).some(log => !existingIds.includes(log.id))).toBeTruthy();
  const id = (await deviceLogs(page)).find(log => !existingIds.includes(log.id)).id;
  await page.getByRole("button", { name: "Next work entry" }).click();
  await page.getByLabel("Work category").selectOption("GT_ROTARY_SONIC");
  await page.getByLabel("Next activity starts").fill(time(7));
  await page.getByLabel("Work description").fill("Rotary sonic drilling across two points");
  await saved(page, "Save next work entry");
  await page.getByRole("button", { name: "Crew", exact: true }).click();
  await page.getByRole("button", { name: /Local Crew North.*On shift/ }).click();
  await page.getByLabel("Left", { exact: true }).fill(time(6));
  await saved(page, "Save attendance");
  await page.getByRole("button", { name: "Add crew member" }).click();
  await expect(page.getByRole("button", { name: /Local Crew South/ })).toBeHidden();
  await page.getByLabel("Show all users").check();
  await expect(page.getByRole("button", { name: /Local Crew South/ })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /Local Crew North/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: /Local Crew North.*On shift/ }).click();
  await page.getByLabel("Joined", { exact: true }).fill(time(5));
  await saved(page, "Save attendance");
  await page.getByRole("button", { name: "Daily log", exact: true }).click();
  await page.getByRole("button", { name: /CURRENT POINT.*BH5049/ }).click();
  await page.getByLabel("Point change time").fill(time(4));
  await page.getByLabel("Finishing depth").fill("12.4");
  await page.getByLabel("Next point").selectOption("BH5050");
  await saved(page, "Change point and save");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Add site item" }).click();
  await page.getByLabel("Catalogue entry").selectOption("GT_CEMENT");
  await page.getByLabel("Quantity / reading").fill("3");
  await saved(page, "Save site item");
  await page.getByLabel("Daily notes").fill("Offline Geotech acceptance record");
  await expect.poll(async () => (await deviceLogs(page)).find(log => log.id === id)?.notes).toBe("Offline Geotech acceptance record");
  await page.reload();
  await page.getByRole("button", { name: "Daily log", exact: true }).click();
  await expect(page.getByRole("button", { name: /CURRENT POINT.*BH5050/ })).toBeVisible();
  const restored = (await deviceLogs(page)).find(log => log.id === id);
  expect(restored.crew.filter(p => p.employeeCodeSnapshot === "LB001")).toHaveLength(2);
  expect(restored.items[0].quantity).toBe(3);
  expect(restored.notes).toBe("Offline Geotech acceptance record");
  await page.close();
  page = await context.newPage();
  await page.goto(`/?dailyLogId=${id}`);
  await expect(page.getByRole("button", { name: /CURRENT POINT.*BH5050/ })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("dailyLogId")).toBeFalsy();
  await page.getByRole("button", { name: "End shift now" }).click();
  await page.getByLabel("Shift finish").fill(time(1));
  await page.getByLabel("Finishing depth").fill("4.2");
  await saved(page, "End shift and save");
  await page.getByRole("button", { name: "Review completed shift" }).click();
  await expect(page.getByText("Field entry is complete and ready for submission.")).toBeVisible();
  await context.setOffline(false);
  await sync(page);
  const server = await page.request.get(`/api/v1/daily-logs/${id}`);
  expect(server.ok()).toBeTruthy();
  expect((await server.json()).log.points).toHaveLength(2);
  await page.screenshot({ path: "test-results/step4-geotech-review.png" });
  await page.getByRole("button", { name: "Continue previous work" }).click();
  await page.getByLabel("Shift start").fill(time(0.5));
  await page.getByRole("button", { name: "Start daily record" }).click();
  await expect(page.getByRole("heading", { name: "Job 302670", exact: true })).toBeVisible();
  const next = (await deviceLogs(page)).find(log => log.carriedFromLogId === id);
  expect(next.points[0].startDepthM).toBe(4.2);
  expect(next.setup.boreSize).toBe("150 mm");
  expect(next.activities).toHaveLength(1); expect(next.items).toHaveLength(0); expect(next.notes).toBeNull();
  expect(errors).toEqual([]);
});

test("an authenticated draft survives a full browser-process restart without a network", async ({ playwright }) => {
  const profile = mkdtempSync(path.join(tmpdir(), "substrata-jobs-browser-test-"));
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, { headless: true, baseURL: "http://localhost:18080", viewport: { width: 390, height: 844 } });
    let page = context.pages()[0];
    await signIn(page);
    await page.getByRole("button", { name: /Start ancillary workday/ }).click();
    await page.getByLabel("Shift start").fill(time(5));
    await page.getByRole("button", { name: "Start daily record" }).click();
    await expect(page.getByRole("heading", { name: "Ancillary workday", exact: true })).toBeVisible();
    await page.getByLabel("Daily notes").fill("Survives full browser restart");
    await expect.poll(async () => (await deviceLogs(page)).some(log => log.notes === "Survives full browser restart")).toBeTruthy();
    await context.close();
    context = await playwright.chromium.launchPersistentContext(profile, { headless: true, offline: true, baseURL: "http://localhost:18080", viewport: { width: 390, height: 844 } });
    page = context.pages()[0]; await page.goto("/");
    await expect(page.getByRole("heading", { name: "Ancillary workday", exact: true })).toBeVisible();
    await expect(page.getByLabel("Daily notes")).toHaveValue("Survives full browser restart");
  } finally {
    await context?.close();
    removeProfile(profile);
  }
});

test("unfinished form input survives offline app closure before it is committed to the log", async ({ page, context }) => {
  await signIn(page);
  await page.getByRole("button", { name: /Start ancillary workday/ }).click();
  await page.getByLabel("Shift start").fill(time(5));
  await page.getByRole("button", { name: "Start daily record" }).click();
  await expect(page.getByRole("heading", { name: "Ancillary workday", exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Start next activity now" }).click();
  await page.getByLabel("Activity category").selectOption("ANC_TRAINING");
  await page.getByLabel("Work description").fill("Unfinished training description");
  await expect.poll(() => page.evaluate(() => new Promise(resolve => { const request = indexedDB.open("substrata-jobs"); request.onsuccess = () => { const db = request.result; const read = db.transaction("metadata").objectStore("metadata").getAll(); read.onsuccess = () => { db.close(); resolve(JSON.stringify(read.result).includes("Unfinished training description")); }; }; }))).toBeTruthy();
  await page.close(); page = await context.newPage(); await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Activity", exact: true })).toBeVisible();
  await expect(page.getByLabel("Work description")).toHaveValue("Unfinished training description");
  await expect(page.getByLabel("Activity category")).toHaveValue("ANC_TRAINING");
});

test("a server-committed sync whose response is lost remains idempotent after another edit", async ({ page }) => {
  await signIn(page);
  let lost = false;
  await page.route("**/api/v1/sync", async route => {
    if (!lost) { lost = true; await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByRole("button", { name: /Start ancillary workday/ }).click();
  await page.getByLabel("Shift start").fill(time(5));
  await page.getByRole("button", { name: "Start daily record" }).click();
  await expect(page.getByRole("heading", { name: "Ancillary workday", exact: true })).toBeVisible();
  const logs = await deviceLogs(page), id = logs.find(log => log.logType === "ancillary" && !log.shift.endedAt && log.serverRevision === 0).id;
  await page.locator(".sync-chip").click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.locator(".sync-chip")).toHaveText("Failed");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Daily notes").fill("Edit after lost server response");
  await expect.poll(async () => (await deviceLogs(page)).find(log => log.id === id)?.notes).toBe("Edit after lost server response");
  await sync(page);
  const server = (await (await page.request.get(`/api/v1/daily-logs/${id}`)).json()).log;
  expect(server.serverRevision).toBe(2);
  expect(server.notes).toBe("Edit after lost server response");
});

test("group ancillary day has no job/rig/client controls and keeps allocations through offline recovery", async ({ page, context }) => {
  await signIn(page);
  await page.getByRole("button", { name: /Start ancillary workday/ }).click();
  await page.getByLabel("Shift start").fill(time(8));
  await page.getByRole("button", { name: "Add or replace crew member" }).click();
  await page.getByRole("button", { name: /Local Crew North/ }).click();
  await context.setOffline(true);
  const existingIds = new Set((await deviceLogs(page)).map(log => log.id));
  await page.getByRole("button", { name: "Start daily record" }).click();
  await expect(page.getByRole("heading", { name: "Ancillary workday", exact: true })).toBeVisible();
  const id = (await deviceLogs(page)).find(log => !existingIds.has(log.id) && log.logType === "ancillary").id;
  expect((await deviceLogs(page)).find(log => log.id === id).crew).toHaveLength(2);
  await page.getByRole("button", { name: "Start next activity now" }).click();
  await page.getByLabel("Activity category").selectOption("ANC_TRAVEL_NONJOB");
  await page.getByLabel("Payroll allocation").selectOption("ANC_TRAVEL_NONJOB");
  await page.getByLabel("Next activity starts").fill(time(3));
  await saved(page, "Start next activity");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Non-job travel", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Substrata Field/ })).toBeHidden();
  await page.getByRole("button", { name: "End shift now" }).click();
  await page.getByLabel("Shift finish").fill(time(1));
  await saved(page, "End shift and save");
  await page.getByRole("button", { name: "Review completed shift" }).click();
  await expect(page.getByText("Field entry is complete and ready for submission.")).toBeVisible();
  const log = (await deviceLogs(page)).find(log => log.id === id);
  expect(log.shift.endedAt).toBeTruthy();
  expect(log.job).toBeNull(); expect(log.equipment).toBeNull(); expect(log.crew).toHaveLength(2);
  expect(log.activities.every(a => a.allocation.type === "ancillary")).toBeTruthy();
  await context.setOffline(false); await sync(page);
});

test("Water assignment can be selected outside the plan and saves meter readings", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: /Local Water job/ })).toBeHidden();
  await page.getByRole("button", { name: "My assignments only" }).click();
  await page.getByRole("button", { name: /Local Water job/ }).click();
  await page.getByLabel("Shift start").fill(time(8));
  await page.getByLabel("Starting point").selectOption("WB-03");
  await page.getByRole("button", { name: "Start daily record" }).click();
  await expect(page.getByRole("heading", { name: "Job 302684", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Add site item" }).click();
  await page.getByLabel("Item type").selectOption("measurement");
  await page.getByLabel("Description", { exact: true }).fill("Water meter reading");
  await page.getByLabel("Quantity / reading").fill("1250");
  await page.getByLabel("Unit", { exact: true }).fill("L");
  await page.getByLabel("Details / meter identifier").fill("Meter WM-12");
  await saved(page, "Save site item");
  await sync(page);
  const log = (await deviceLogs(page)).find(log => log.division === "Water" && !log.shift.endedAt);
  const response = await page.request.get(`/api/v1/daily-logs/${log.id}`);
  expect((await response.json()).log.items[0].notes).toBe("Meter WM-12");
});
