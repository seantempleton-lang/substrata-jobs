import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import express from "express";
import { clearSessionCookie, login, logout, requireAuth, setSessionCookie } from "./auth.mjs";
import { closePool, query } from "./db.mjs";
import { getBootstrap, recordSyncProbe } from "./repository.mjs";
import { applySyncBatch, listDailyLogs, readDailyLog } from "./dailyLogs.mjs";
import { getFieldPoints, createHandoff, consumeHandoff, serviceAuthorized } from "./field.mjs";

const app = express();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repoRoot, "dist");

if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function apiError(res, error) {
  const status = error.statusCode || 500;
  const correlationId = crypto.randomUUID();
  if (status >= 500) console.error(`[${correlationId}]`, error);
  res.status(status).json({
    error: {
      code: error.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
      message: status >= 500 ? "The server could not complete the request." : error.message,
      retryable: status >= 500,
      correlationId,
    },
  });
}

app.get("/health", (_req, res) => res.type("text/plain").send("ok"));

app.get("/api/v1/health", async (_req, res) => {
  const checks = { application: "ok", database: "unconfigured", opsIdentity: "unknown", jobsSchema: "unknown" };
  if (!process.env.DATABASE_URL) return res.status(503).json({ ok: false, checks });
  try {
    const result = await query(`select
      to_regclass('public.app_users') is not null as ops_identity,
      to_regclass('jobs_app.catalogue_items') is not null as jobs_schema`);
    checks.database = "ok";
    checks.opsIdentity = result.rows[0].ops_identity ? "ok" : "missing";
    checks.jobsSchema = result.rows[0].jobs_schema ? "ok" : "missing";
    const ok = Object.values(checks).every((value) => value === "ok");
    return res.status(ok ? 200 : 503).json({ ok, checks });
  } catch (error) {
    checks.database = "error";
    return res.status(503).json({ ok: false, checks, message: error.message });
  }
});

app.post("/api/v1/session/login", async (req, res) => {
  try {
    const session = await login(req, req.body?.username ?? req.body?.email, req.body?.password);
    setSessionCookie(res, req, session.token, session.expiresAt);
    res.status(201).json({ authenticated: true, user: session.user, expiresAt: session.expiresAt });
  } catch (error) {
    apiError(res, error);
  }
});

app.get("/api/v1/session", requireAuth, (req, res) => {
  res.json({ authenticated: true, user: req.auth.user, expiresAt: req.auth.expiresAt });
});

app.delete("/api/v1/session", requireAuth, async (req, res) => {
  try {
    await logout(req);
    clearSessionCookie(res, req);
    res.status(204).end();
  } catch (error) {
    apiError(res, error);
  }
});

app.get("/api/v1/bootstrap", requireAuth, async (req, res) => {
  try {
    const today = new Date();
    const defaultFrom = today.toISOString().slice(0, 10);
    const defaultToDate = new Date(today.getTime() + 13 * 86_400_000);
    const payload = await getBootstrap({
      user: req.auth.user,
      from: req.query.from || defaultFrom,
      to: req.query.to || defaultToDate.toISOString().slice(0, 10),
      myAssignmentsOnly: req.query.myAssignmentsOnly !== "false",
    });
    res.json(payload);
  } catch (error) {
    apiError(res, error);
  }
});

app.post("/api/v1/sync/probe", requireAuth, async (req, res) => {
  try {
    const result = await recordSyncProbe({ userId: req.auth.user.userId, ...req.body });
    res.status(result.status === "applied" ? 201 : 200).json({ contractVersion: "1.0", ...result });
  } catch (error) {
    apiError(res, error);
  }
});

app.post("/api/v1/sync", requireAuth, async (req, res) => {
  try {
    const payload = await applySyncBatch({ body: req.body, user: req.auth.user });
    res.json(payload);
  } catch (error) {
    apiError(res, error);
  }
});

app.get("/api/v1/points", requireAuth, async (req, res) => {
  try {
    if (!req.query.jobNumber) return res.status(400).json({ error: { message: "Job number is required." } });
    res.json({ points: await getFieldPoints(req.query.jobNumber) });
  } catch (error) { apiError(res, error); }
});
app.get("/api/v1/daily-logs", requireAuth, async (req, res) => {
  try { res.json({ logs: await listDailyLogs(req.auth.user) }); } catch (error) { apiError(res, error); }
});
app.get("/api/v1/office/daily-logs", requireAuth, async (req, res) => {
  try { res.json({ logs: await listDailyLogs(req.auth.user, true) }); } catch (error) { apiError(res, error); }
});
app.get("/api/v1/daily-logs/:id", requireAuth, async (req, res) => {
  try { res.json({ log: await readDailyLog(req.params.id, req.auth.user) }); } catch (error) { apiError(res, error); }
});
app.post("/api/v1/field-handoffs", requireAuth, async (req, res) => {
  try { res.status(201).json(await createHandoff(req.body, req.auth.user)); } catch (error) { apiError(res, error); }
});
app.post("/api/v1/field-handoffs/consume", async (req, res) => {
  if (!serviceAuthorized(req.get("X-Jobs-Key"))) return res.status(403).json({ error: { message: "Field service authentication is required." } });
  try { res.json(await consumeHandoff(req.body)); } catch (error) { apiError(res, error); }
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: "1h" }));
  app.use((req, res, next) => req.path.startsWith("/api/") ? next() : res.sendFile(path.join(distDir, "index.html")));
}

app.use((req, res) => {
  if (req.path.startsWith("/api/")) res.status(404).json({ error: { code: "NOT_FOUND", message: "API route not found.", retryable: false, correlationId: crypto.randomUUID() } });
  else res.status(404).type("text/plain").send("Not found");
});

app.use((error, _req, res, _next) => apiError(res, error));

const port = Number(process.env.PORT || 8080);
const server = app.listen(port, () => console.log(`Substrata Jobs listening on port ${port}`));

export { app, server };

function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
