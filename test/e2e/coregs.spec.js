import { test, expect } from "@playwright/test";
import { localInput } from "../../src/domain/time.js";

test("Jobs reads CORE-GS points without the Field HTTP service and keeps saved options when refresh fails", async ({ page }) => {
  expect((await page.request.get("/api/v1/points?jobNumber=302670")).status()).toBe(401);
  expect((await page.request.post("/api/v1/session/login", { data: { username: "localdriller", password: "TestPassword123!" } })).ok()).toBeTruthy();
  const health = await (await page.request.get("/api/v1/health")).json();
  expect(health.capabilities.points).toEqual({ source: "core_gs", enabled: true, configured: true });
  expect(JSON.stringify(health)).not.toContain("fixture-password");
  const points = (await (await page.request.get("/api/v1/points?jobNumber=302670")).json()).points;
  expect(points.map(point => point.pointId)).toEqual(["BH5049", "BH5050"]);
  expect(points.every(point => point.jobNumber === "302670")).toBeTruthy();
  expect(points[1].plannedDepthM).toBeNull();
  expect((await (await page.request.get("/api/v1/points?jobNumber=302684")).json()).points.map(point => point.pointId)).toEqual(["WB-03"]);
  expect((await (await page.request.get("/api/v1/points?jobNumber=unknown-project")).json()).points).toEqual([]);
  expect((await page.request.get("/api/v1/points?jobNumber=a&jobNumber=b")).status()).toBe(400);
  await page.goto("/");
  await page.getByRole("button", { name: /Local integration job/ }).click();
  await page.getByLabel("Shift start").fill(localInput(new Date(Date.now() - 3600000).toISOString()));
  await page.getByLabel("Starting point").selectOption("BH5049");
  await page.getByRole("button", { name: "Start daily record", exact: true }).click();
  await page.getByRole("button", { name: /CURRENT POINT BH5049/ }).click();
  await page.getByRole("button", { name: "Refresh points", exact: true }).click();
  await page.getByLabel("Next point").selectOption("BH5050");
  await page.route("**/api/v1/points?*", route => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "CORE_GS_UNAVAILABLE", message: "CORE-GS points could not be read. Previously saved points remain available." } }) }));
  await page.getByRole("button", { name: "Refresh points", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Previously saved points remain available.");
  await expect(page.getByLabel("Next point")).toHaveValue("BH5050");
});
